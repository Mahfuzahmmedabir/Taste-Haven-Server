const express = require('express');
const cors = require('cors');
const app = express();
const jwt = require('jsonwebtoken');
require('dotenv').config();

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
console.log(process.env.STRIPE_SECRET_KEY);
const port = process.env.PORT || 5000;
app.use(cors());
app.use(express.json());
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.m5ccm.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const menuCollection = client.db('bistoDB').collection('menu');
    const usersCollection = client.db('bistoDB').collection('users');
    const reviewsCollection = client.db('bistoDB').collection('reviews');
    const cartCollection = client.db('bistoDB').collection('cart');
    const paymentCollection = client.db('bistoDB').collection('payment');

    // jwt related api

    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '12h',
      });

      res.send({ token });
    });
    // verifyToken
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ massage: 'forbeden access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decode) => {
        if (err) {
          return res.status(401).send({ massage: 'forbeden access' });
        }
        req.decode = decode;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.decode.email;
      const quray = { email: email };
      const user = await usersCollection.findOne(quray);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ massage: 'forbidden access' });
      }
      next();
    };
    // user Relited
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const reslut = await usersCollection.find().toArray();
      res.send(reslut);
    });

    app.get(
      '/user/admin/:email',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        if (email !== req.decode.email) {
          return res.status(403).send({ massage: 'unauthorization access' });
        }
        const quary = { email: email };
        const user = await usersCollection.findOne(quary);
        let admin = false;
        if (user) {
          admin = user?.role === 'admin';
        }
        res.send({ admin });
      }
    );

    app.post('/users', async (req, res) => {
      const user = req.body;
      const quary = { email: user.email };
      const exUser = await usersCollection.findOne(quary);
      if (exUser) {
        return res.send({ masseg: 'user arlraly exists' });
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
    app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const quary = { _id: new ObjectId(id) };
      const result = await usersCollection.deleteOne(quary);
      res.send(result);
    });
    app.patch(
      '/users/admin/:id',
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updeatdDoc = {
          $set: {
            role: 'admin',
          },
        };
        const reslut = await usersCollection.updateOne(filter, updeatdDoc);
        res.send(reslut);
      }
    );

    // menu re api

    app.get('/menu', async (req, res) => {
      const result = await menuCollection.find().toArray();
      res.send(result);
    });

    app.post('/menu', verifyToken, verifyAdmin, async (req, res) => {
      const items = req.body;
      const reslut = await menuCollection.insertOne(items);
      res.send(reslut);
    });
    app.get('/menu/:id', async (req, res) => {
      const id = req.params.id;
      const qurear = { _id: new ObjectId(id) };
      const reslut = await menuCollection.findOne(qurear);
      res.send(reslut);
    });
    app.delete('/menu/:id', verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const reslut = await menuCollection.deleteOne(filter);
      res.send(reslut);
    });

    // review
    app.get('/review', async (req, res) => {
      const result = await reviewsCollection.find().toArray();
      res.send(result);
    });
    // cart api

    app.get('/carts', async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const result = await cartCollection.find(query).toArray();
      res.send(result);
    });

    app.delete('/carts/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await cartCollection.deleteOne(query);
      res.send(result);
    });
    app.post('/carts', async (req, res) => {
      const cart = req.body;
      const result = await cartCollection.insertOne(cart);
      res.send(result);
    });

    app.get('/', (req, res) => {
      res.send('Hello world');
    });
    if (verifyToken || verifyAdmin) {
      app.post('/create-payment-intent', async (req, res) => {
        const { price } = req.body;
        const amount = parseInt(price * 100);
        // console.log(amount, 'aouoewdsfsd');
        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: 'usd',
          payment_method_types: ['card'],
        });

        res.send({ clientSecret: paymentIntent.client_secret });
      });

      app.post('/payments', async (req, res) => {
        const payment = req.body;
        console.log(payment);
        const paymentResult = await paymentCollection.insertOne(payment);
        const quary = {
          _id: {
            $in: payment.cardId.map(id => new ObjectId(id)),
          },
        };
        const deleteMany = await cartCollection.deleteMany(quary);
        res.send({ paymentResult, deleteMany });
      });
    }

    app.get('/admin-status', verifyToken,verifyAdmin, async (req, res) => {
      const user = await usersCollection.estimatedDocumentCount();
      const itemsCount = await menuCollection.estimatedDocumentCount();
      const orders = await paymentCollection.estimatedDocumentCount();

      const payment = await paymentCollection.aggregate([
        {
          $group: {
            _id: null,
            totalRevenue: {
              $sum: '$price'
            }
          }
        },
      ]).toArray()
      const result = payment.length > 0 ? payment[0].totalRevenue : 0;

      res.send({
        user,
        itemsCount,
        orders,
        result,
      });
    });

    // Send a ping to confirm a successful connection
    await client.db('admin').command({ ping: 1 });
    console.log(
      'Pinged your deployment. You successfully connected to MongoDB!'
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`server is running on ${port}`);
});
