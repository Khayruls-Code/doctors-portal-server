const express = require('express')
const cors = require('cors')
require('dotenv').config()
const admin = require("firebase-admin");
const ObjectId = require("mongodb").ObjectId;
const app = express()
const port = process.env.PORT || 5000
app.use(cors())
app.use(express.json())
const stripe = require('stripe')(process.env.STRIPE_SECRET)

app.get('/', (req, res) => {
  res.send('Doctors Portal Running')
})


const serviceAccount = JSON.parse(process.env.FIREBASE_SERVER_ACCOUNT)

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

async function verifyToken(req, res, next) {
  if (req.headers?.authirization?.startsWith('Bearer ')) {
    const token = req.headers.authirization.split(' ')[1]
    try {
      const decodedUser = await admin.auth().verifyIdToken(token)
      req.decodedEmail = decodedUser.email
    } catch {

    }
  }
  next()
}

const { MongoClient } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.xfro9.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true });

app.listen(port, () => {
  console.log('I am Listening post no: ', port)
})

async function run() {
  try {
    await client.connect()
    const database = client.db('doctors-db')
    const appointmentCollection = database.collection('appointments')
    const userCollection = database.collection('users')

    app.get('/appointments', async (req, res) => {
      const email = req.query.email
      const date = new Date(req.query.date).toLocaleDateString()
      const query = { email: email, date: date }

      const cursor = appointmentCollection.find(query)
      const result = await cursor.toArray()
      res.json(result)
    })

    app.post('/appointments', async (req, res) => {
      const appointment = req.body;
      const result = await appointmentCollection.insertOne(appointment)
      res.json(result)
    })

    //get appointment by ad
    app.get('/appointments/:id', async (req, res) => {
      const id = req.params.id;
      const query = { "_id": ObjectId(id) }
      const result = await appointmentCollection.findOne(query)
      res.json(result)
    })

    //users api

    app.post('/users', async (req, res) => {
      const user = req.body
      const result = await userCollection.insertOne(user)
      res.send(result)
    })

    app.put('/users', async (req, res) => {
      const user = req.body
      const filter = { email: user.email }
      const options = { upsert: true };
      const updateDoc = {
        $set: user
      };
      const result = await userCollection.updateOne(filter, updateDoc, options);
      res.json(result)
    })

    //admin api
    app.put('/users/admin', verifyToken, async (req, res) => {
      const emailObj = req.body
      const requester = req.decodedEmail;
      if (requester) {
        const requesterAccount = { email: requester }
        const user = await userCollection.findOne(requesterAccount)
        if (user.role === 'admin') {
          const filter = { email: emailObj.email }
          const updateDoc = {
            $set: { role: "admin" }
          }
          const result = await userCollection.updateOne(filter, updateDoc)
          res.status(403).json(result || 'You do not have access to add an admin')
        }
      }
    })

    //check admin

    app.get('/users/:email', async (req, res) => {
      const email = req.params.email
      const query = { email: email }
      let isAdmin = false;
      const user = await userCollection.findOne(query)
      if (user?.role === 'admin') {
        isAdmin = true
      }
      res.json({ admin: isAdmin })
    })

    //stripe payment api

    app.post('/create-payment-intent', async (req, res) => {
      const paymentInfo = req.body;
      const amount = paymentInfo.price * 100
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: [
          "card"
        ],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    })
    //save payment on database
    app.put('/appointments/:id', async (req, res) => {
      const id = req.params.id
      const filter = { '_id': ObjectId(id) }
      const payment = req.body
      const updateDoc = {
        $set: {
          payment: payment
        }
      }
      const result = await appointmentCollection.updateOne(filter, updateDoc)
      res.json(result)
    })
  }
  finally {
    // client.close()
  }
}

run().catch(console.dir)