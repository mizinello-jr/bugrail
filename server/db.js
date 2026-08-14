require('dotenv').config();
const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017';
const dbName = process.env.DB_NAME || 'bugrail';

const client = new MongoClient(uri, { connectTimeoutMS: 5000 });
let dbPromise = null;

function getDb(){
  if (!dbPromise) dbPromise = client.connect().then(() => client.db(dbName));
  return dbPromise;
}

module.exports = { getDb };
