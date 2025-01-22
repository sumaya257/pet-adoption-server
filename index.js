const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const morgan = require('morgan')


// This is your test secret API key.
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

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
    const paymentCollection = client.db('petAdoption').collection('paymentCollections')

     // jwt related api
    app.post('/jwt', async (req, res) => {
      const user = req.body;
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
      res.send({ token });
    })

     // middlewares 
     const verifyToken = (req, res, next) => {
      // console.log('inside verify token', req.headers.authorization);
      if (!req.headers.authorization) {
        return res.status(401).send({ message: 'unauthorized access' });
      }
      const token = req.headers.authorization.split(' ')[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: 'unauthorized access' })
        }
        req.decoded = decoded;
        next();
      })
    }

     // use verify admin after verifyToken
     const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      const isAdmin = user?.role === 'admin';
      if (!isAdmin) {
        return res.status(403).send({ message: 'forbidden access' });
      }
      next();
    }
   // users related api
    app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });
   app.get('/users/admin/:email', verifyToken, async (req, res) => {
      const email = req.params.email;

      if (email !== req.decoded.email) {
        return res.status(403).send({ message: 'forbidden access' })
      }
      const query = { email: email };
      const user = await userCollection.findOne(query);
      let admin = false;
      if (user) {
        admin = user?.role === 'admin';
      }
      res.send({ admin });
    })

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

  app.patch('/users/admin/:id', async (req, res) => {
    const id  = req.params.id;
    const filter = {_id:new ObjectId(id)}
    const updateDoc = {
      $set:{
        role:'admin'
      }
    }
    const result = await userCollection.updateOne(filter,updateDoc)
    res.send(result)
});


    app.post('/pets',async(req,res)=>{
      const pet = req.body
      const result = await addedPetCollection.insertOne(pet)
      return res.send(result)
    })

    //admin-all-pets
    app.get('/pets', verifyToken, verifyAdmin, async (req, res) => {
      const result = await addedPetCollection.find().toArray();
      res.send(result);
    });
    //admin-all-pets-delete
    // app.delete('/pets/:id', async (req, res) => {
    //   try {
    //     const petId = new ObjectId(req.params.id);
    //     const result = await addedPetCollection.deleteOne({ _id: petId });
  
    //     if (result.deletedCount === 0) {
    //       return res.status(404).send('Pet not found');
    //     }
    //     res.send('Pet deleted successfully');
    //   } catch (err) {
    //     res.status(500).send('Error deleting pet');
    //   }
    // });


    app.post('/adopt-pet',async(req,res)=>{
      const data = req.body
       // Find the pet's email from the addpets collection
     const matchingPet = await addedPetCollection.findOne({ _id: new ObjectId(data.petId) });

    if (!matchingPet) {
      return res.status(404).json({ error: "Pet not found in addpets collection" });
    }
    // Include the email from addpets in the adoption data
    const adoptionData = {
      ...data,
      authorEmail: matchingPet.email, // Include email from addpets
    };
    // Save to adopt-pets collection
    const result = await adoptPetCollection.insertOne(adoptionData);
      console.log(result)
      return res.send(result)
    })

    app.get('/adopt-pet',async(req,res)=>{
      const email = req.query.email
      const adoptionRequest = await adoptPetCollection.find({ 
        authorEmail: email }).toArray()
      res.send(adoptionRequest)
      console.log(adoptionRequest)
    })

    // Route to handle both accept and reject
    app.patch('/adopt-pet/:id', async (req, res) => {
      try {
        const { id } = req.params; // Extract the request ID
        const { action } = req.body; // Action type (either 'accept' or 'reject')
    
        // Validate action
        if (!['accept', 'reject'].includes(action)) {
          return res.status(400).send({ message: 'Invalid action type' });
        }
    
        // Create the filter object using ObjectId for MongoDB
        const filter = { _id: new ObjectId(id) };
    
        // Create the update operation based on action type
        let update;
        if (action === 'accept') {
          update = { $set: { status: 'accepted' } };
        } else if (action === 'reject') {
          update = { $set: { status: 'rejected' } };
        }
    
        // Perform the update
        const result = await adoptPetCollection.updateOne(filter, update);
    
        // If no document was updated, send a 404 response
        if (result.modifiedCount === 0) {
          return res.status(404).send({ message: 'Request not found or already updated' });
        }
    
        // Send a success response
        res.status(200).send({ message: `Request ${action}ed successfully!` });
      } catch (error) {
        console.error('Error handling request:', error);
        res.status(500).send({ message: 'Internal server error' });
      }
    });

    // added donations
    app.post('/donations',async(req,res)=>{
      const donation = req.body
      const result = await addedDonationCollection.insertOne(donation)
      return res.send(result)
    })

  // Fetch paginated pets
  app.get('/pets/my-pets',verifyToken, async (req, res) => {
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
    console.log(myDonations)
  })

  /// Endpoint to get all donations with conditional paused filtering
app.get('/donations', async (req, res) => {
  try {
    const { paused } = req.query; // Extract 'paused' from query string

    let query = {}; // Default query returns all donations

    // If 'paused' is provided in the query, filter based on its value
    if (paused !== undefined) {
      query.paused = paused === 'true'; // Converts 'true'/'false' to boolean
    }

    // Fetch donations from the database with the constructed query
    const donations = await addedDonationCollection.find(query).toArray();

    // Send the donations to the frontend
    res.status(200).send(donations);
  } catch (error) {
    console.error('Error fetching donations:', error);
    res.status(500).send({ message: 'Internal Server Error' });
  }
});

  //fetch donation by id
  app.get('/donation-details/:id',async(req,res)=>{
    const donationId = new ObjectId(req.params.id)
    const result = await addedDonationCollection.findOne({_id:donationId})
    return res.send(result)
  })

  //aggregate data foe specific id
  app.get("/donations/:campaignId/donators", async (req, res) => {
    try {
        const { campaignId } = req.params;

        // Aggregate data for the specified campaignId
        const campaignDetails = await paymentCollection.aggregate([
            {
                $match: { campaignId } // Match donations for the campaign
            },
            {
                $group: {
                    _id: "$campaignId", // Group by campaignId
                    totalDonation: {
                        $sum: {
                            $toDouble: "$donationAmount"
                        } // Sum donation amounts
                    },
                    donators: {
                        $push: {
                            name: "$userName", // Corrected field name for userName
                            amount: {
                                $toDouble: "$donationAmount"
                            } // Corrected field name for donationAmount
                        }
                    }
                }
            }
        ]).toArray();

        console.log("Aggregated Campaign Details:", campaignDetails); // Debugging the result

        // Handle the case when no donations exist for the campaign
        if (campaignDetails.length === 0) {
            return res.json({
                totalDonation: 0,
                donators: [],
            });
        }

        // Extract totalDonation and donators from the aggregation result
        const { totalDonation, donators } = campaignDetails[0] || { totalDonation: 0, donators: [] };
        console.log('Total Donation:', totalDonation);

        // Update the campaign summary in a separate collection (only update totalDonation)
        const result = await addedDonationCollection.updateOne(
            { campaignId }, // Match the campaignId
            {
                $set: {
                    campaignId, // Ensure the campaignId is stored
                    totalDonation, // Store the aggregated total donation
                    lastUpdated: new Date() // Timestamp of the last update
                },
            },
            { upsert: true } // Insert a new document if it doesn't exist
        );
        console.log("Update Result:", result);

        // Send the aggregated result as a response
        return res.json({
            totalDonation: totalDonation || 0, // Default to 0 if undefined
            donators: donators || [], // Default to empty array if undefined
        });
    } catch (error) {
        console.error("Error fetching campaign details:", error);
        return res.status(500).json({ error: "Failed to fetch campaign details" });
    }
});





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
    const donationId = req.params.id;
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

//payment intent

app.post('/create-payment-intent', async (req, res) => {
  try {
      const { amount } = req.body;
      console.log(amount)

      // Validate the payment
      if (!amount || isNaN(amount) || amount <= 0) {
          return res.status(400).send({ error: 'Invalid payment. Please provide a valid amount.' });
      }

      console.log(amount, 'amount inside the intent');

      // Create a payment intent
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
          currency: 'usd',
          payment_method_types: ['card'], // Optional: Specify payment methods
      });

      // Send the client secret to the frontend
      res.send({
          clientSecret: paymentIntent.client_secret,
      });
  } catch (error) {
      console.error('Error creating payment intent:', error);
      res.status(500).send({ error: 'Failed to create payment intent. Please try again later.' });
  }
});

//confirm payment
app.post('/payments', async (req, res) => {
  const payment = req.body;
  const paymentResult = await paymentCollection.insertOne(payment);
  res.send(paymentResult);
})

app.get('/payments/my-donations', async (req, res) => {
  const email = req.query.email; // Get the email from query parameters
  console.log("Email:", email); // Check if the email is correctly received
  
  try {
    const myDonations = await paymentCollection.find({ userEmail: email }).toArray();
    res.send(myDonations);
    console.log(myDonations);
  } catch (error) {
    // If there's an error, send an error message
    res.status(500).send({ message: 'Error fetching donations', error: error.message });
  }
});

//refund
app.delete('/payments/refund/:id', async (req, res) => {
  try {
    const paymentId = new ObjectId(req.params.id);
    const result = await paymentCollection.deleteOne({ _id: paymentId });

    if (result.deletedCount === 0) {
      return res.status(404).send('Pet not found');
    }
    res.send('Pet deleted successfully');
  } catch (err) {
    res.status(500).send('Error deleting pet');
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


 

