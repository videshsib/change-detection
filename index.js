require('dotenv').config();
const express = require("express");
const fs = require('fs');
const path = require('path');
const simpleGit = require('simple-git');

const app = express();
const port = 3000;

const { MongoClient } = require('mongodb');

async function watchCollection() {
  const uri = process.env.MONGODB_URI;
  const client = new MongoClient(uri,
    //  { useNewUrlParser: true, useUnifiedTopology: true }
     );

  try {
    await client.connect();
    console.log('Connected to MongoDB');

    const database = client.db('DDL'); 
    const collection = database.collection('unified_json'); 
    const jsonFilePath = path.join(__dirname, 'collectionData.json'); 
    const git = simpleGit();

    async function fetchAndUpdateJSON() {
      const documents = await collection.find({}).toArray();
      await git.checkout('master');
      await git.pull('origin', 'master');

      fs.writeFile(jsonFilePath, JSON.stringify(documents, null, 2), (err) => {
        if (err) {
          console.error('Error writing to JSON file:', err);
        } else {
          console.log('JSON file has been updated.');
        }
      });
    }

    async function commitAndPushChanges() {
      try {
        const branchName = `update-document-${Date.now()}`;
        console.log(branchName)
        await git.checkoutLocalBranch(branchName);
        await git.add(jsonFilePath);
        await git.commit('Update collectionData.json');
        await git.push('origin', branchName);
        console.log(`Changes have been committed and pushed to the ${branchName} branch.`);
      } catch (err) {
        if (err.message.includes('index.lock')) {
          console.error('Git lock file exists. Removing lock file and retrying...');
          fs.unlinkSync(path.join(__dirname, '.git/index.lock'));
          await createBranchCommitAndPush();
        } else {
          console.error('Error creating branch, committing and pushing changes:', err);
        }
      }
    }
    
    const changeStream = collection.watch();

    console.log('Watching for changes...');
    changeStream.on('change',async (change) => {
      await fetchAndUpdateJSON();
      await commitAndPushChanges();
    });

    // Handle errors in the change stream
    changeStream.on('error', (error) => {
      console.error('Change stream error:', error);
    });

  } catch (err) {
    console.error(err);
  }
}

watchCollection().catch(console.error);


app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
