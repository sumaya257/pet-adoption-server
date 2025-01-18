const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const morgan = require('morgan')

const app = express();
const port = process.env.PORT || 5000;
// middleware
app.use(cors());
app.use(express.json());
app.use(morgan('dev'))


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
    const addedDonationCollection = client.db('petAdoption').collection('addedDonations')
    const adoptPetCollection = client.db('petAdoption').collection('adoptPets')



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

    app.post('/adopt-pet',async(req,res)=>{
      const adoptPet = req.body
      const result = await adoptPetCollection.insertOne(adoptPet)
      return res.send(result)
    })

    // added donations
    app.post('/donations',async(req,res)=>{
      const donation = req.body
      const result = await addedDonationCollection.insertOne(donation)
      return res.send(result)
    })


  // Fetch paginated pets
  app.get('/pets/my-pets', async (req, res) => {
    const email = req.query.email
    const page = parseInt(req.query.page) || 0;
    const limit = parseInt(req.query.limit) || 10;
    console.log(email,page,limit);
     try {
      const pets = await addedPetCollection
        .find({ email: email })
        .skip(page * limit)  // Skip the records based on the page number
        .limit(limit)        // Limit the number of records per page
        .toArray();

      const totalPets = await addedPetCollection.countDocuments({ email: email }); // Count the total number of pets
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

  //FETCH my donation page with email query
  app.get('/donations/my-campaigns',async(req,res)=>{
    const email = req.query.email
    const myDonations = await addedDonationCollection.find({ email: email }).toArray()
    res.send(myDonations)
  })


  app.get('/pets', async (req, res) => {
    const { search = '', category = '', adopted } = req.query;
  
    // Prepare filter object
    const filter = {};
  
    // Add search filter if a search term is provided
    if (search) {
      filter.name = { $regex: search, $options: 'i' }; // Case-insensitive search on pet name
    }
  
    // Add category filter if provided
    if (category) {
      filter.category = category;
    }
  
    // Add adopted status filter if provided (expecting a boolean value)
    if (adopted !== undefined) {
      // Convert 'adopted' to a boolean value (false -> false, true -> true)
      filter.adopted = adopted === 'true'; // 'true' string to boolean true, 'false' string to boolean false
    }
  
    try {
      // Fetch all pets based on the filter, without pagination
      const pets = await addedPetCollection.find(filter).toArray();
  
      // Send the response with all matching pets
      res.json(pets);
    } catch (err) {
      res.status(500).send('Error fetching pets');
    }
  });

  //fetch-pet-by-id
  app.get('/pet-listing/:id',async(req,res)=>{
    const petId = new ObjectId(req.params.id)
    const result = await addedPetCollection.findOne({_id:petId})
    return res.send(result)
  })
  

  //fetch donations
  app.get('/donations/my-campaigns',async(req,res)=>{
    const result = await addedDonationCollection.find().toArray()
    res.send(result)
  })

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

   app.get('/pets/:id',async(req,res)=>{
    const petId = new ObjectId(req.params.id);
    const query = {_id: new ObjectId(petId)}
    const result = await addedPetCollection.findOne(query)
    res.send(result)
   })

   app.get('/donations/:id',async(req,res)=>{
    const donationId = new ObjectId(req.params.id);
    const query = {_id: new ObjectId(donationId)}
    const result = await addedDonationCollection.findOne(query)
    res.send(result)
   })

  // Update pet by ID
  app.put('/pets/:id', async (req, res) => {
    try {
      const petId = new ObjectId(req.params.id);
      const updatedPet = await addedPetCollection.findOneAndUpdate(
        { _id: petId },
        { $set: req.body },
        { returnDocument: 'after' }  // Return the updated document
      );
       res.json(updatedPet.value);
    } catch (err) {
      res.status(500).send('Error updating pet');
    }
  });

  /// Patch route to update pet adoption status
app.patch('/pets/:petId', async (req, res) => {
  const { petId } = req.params;


  try {
    // Update adopted status for the pet in the database
    const updatedPet = await addedPetCollection.findOneAndUpdate(
      { _id: new ObjectId(petId) },  // Find pet by ObjectId
      { $set: { adopted: req.body.adopted } }, // Update adopted status
      { returnDocument: 'after' } // Return the updated document
    );

    res.status(200).json(updatedPet.value);
  } catch (error) {
    console.error('Error updating pet:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

//toggolepause and update api
app.put('/dashboard/update-donation/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updatedFields = req.body; // Get the fields to update from the request body

    // Find the existing campaign
    const campaign = await addedDonationCollection.findOne({ _id: new ObjectId(id) });

    // Merge updated fields with the toggled 'paused' field
    const updatedData = {
      ...updatedFields,
      paused: updatedFields.paused !== undefined ? updatedFields.paused : !campaign.paused, // Toggle paused if not explicitly set
    };

    // Update the campaign
    const result = await addedDonationCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updatedData }
    );

    res.send(result);
  } catch (error) {
    console.error("Error updating campaign:", error);
    res.status(500).send({ message: "Failed to update the campaign" });
  }
});



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
