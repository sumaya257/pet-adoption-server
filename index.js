const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;
// middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ju1bs.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const userCollection = client.db('petAdoption').collection('users')
    const addedPetCollection = client.db('petAdoption').collection('addedPets')



    //users related api
    app.post('/users',async(req,res)=>{
        const user = req.body
        // insert email if user doesnot exist
        const query = {email:user.email}
        const existingUser = await userCollection.findOne(query)
        if(existingUser){
           return res.send({message:'user already exists',insertedId:null})
        }
        const result = await userCollection.insertOne(user)
         return res.send(result)
    })

    app.post('/pets',async(req,res)=>{
      const pet = req.body
      const result = await addedPetCollection.insertOne(pet)
      return res.send(result)
    })
    


  // Fetch paginated pets
  app.get('/pets/my-pets', async (req, res) => {
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 10;

    try {
      const pets = await addedPetCollection.find()
        .skip(page * limit)  // Skip the records based on the page number
        .limit(limit)        // Limit the number of records per page
        .toArray();

      const totalPets = await addedPetCollection.countDocuments(); // Count the total number of pets
      res.json({
        pets,
        totalPets,
        totalPages: Math.ceil(totalPets / limit), // Total number of pages
        currentPage: page,  // Current page number
      });
    } catch (err) {
      res.status(500).send('Error fetching pets');
    }
  });

  // Delete pet by ID
  app.delete('/pets/:id', async (req, res) => {
    try {
      const petId = new ObjectId(req.params.id);
      const result = await addedPetCollection.deleteOne({ _id: petId });

      if (result.deletedCount === 0) {
        return res.status(404).send('Pet not found');
      }
      res.send('Pet deleted successfully');
    } catch (err) {
      res.status(500).send('Error deleting pet');
    }
  });

  // Update pet by ID
  app.put('/pets/:id', async (req, res) => {
    try {
      const petId = new ObjectId(req.params.id);
      const updatedPet = await addedPetCollection.findOneAndUpdate(
        { _id: petId },
        { $set: req.body },
        { returnDocument: 'after' }  // Return the updated document
      );

      if (!updatedPet.value) {
        return res.status(404).send('Pet not found');
      }
      res.json(updatedPet.value);
    } catch (err) {
      res.status(500).send('Error updating pet');
    }
  });

  console.log("Pinged your deployment. You successfully connected to MongoDB!");
} finally {
  // Ensures that the client will close when you finish/error
  // await client.close();
}
}

run().catch(console.dir);



app.get('/', (req, res) => {
    res.send('Hello from my server')
})

app.listen(port, () => {
    console.log('My simple server is running at', port);
})
