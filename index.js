const express = require('express')
const app = express()
const port = process.env.PORT || 5000;
const cors = require('cors')
const jwt = require('jsonwebtoken');
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');

// Middleware
app.use(cors())
app.use(express.json())

const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'Unauthorized access' })
    }
    const token = authHeader.split(' ')[1];
    // Check the token validity
    jwt.verify(token, process.env.SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' })
        }
        req.decoded = decoded;
        next()
    })
}



// Using MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.get8p.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect()
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('booking');
        const userCollection = client.db('doctors_portal').collection('user');
        const doctorCollection = client.db('doctors_portal').collection('doctor');


        // Middleware to verify admin
        const verifyAdmin = async (req, res, next) => {
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester })
            if (requesterAccount.role === 'admin') {
                next()
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        }


        app.get('/services', async (req, res) => {
            const query = {};
            // Load only the service name
            const cursor = servicesCollection.find(query).project({ name: 1 });
            const services = await cursor.toArray();
            res.send(services);
        })

        app.get('/available', async (req, res) => {
            // 1. Get all services
            const services = await servicesCollection.find().toArray();

            const date = req.query.date;
            const query = { date: date }
            // 2. Get bookings data of specific date
            const booked = await bookingCollection.find(query).toArray();

            // 3. Check each service that booked or not
            services.forEach(service => {
                const bookedServices = booked.filter(book => book.treatmentName === service.name)
                // 4. Get the booking slots
                const bookedSlots = bookedServices.map(book => book.slot);
                // 5. Remove the booked slot
                const available = service.slots.filter(slot => !bookedSlots.includes(slot))
                // 6. Assign the available slots in the service
                service.slots = available;
            });

            res.send(services);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatmentName: booking.treatmentName, date: booking.date, userEmail: booking.userEmail }
            const existBooking = await bookingCollection.findOne(query);
            if (existBooking) {
                return res.send({ success: false, booking: 'Booking already exists in same date' })
            }
            const result = await bookingCollection.insertOne(booking);
            res.send({ success: true, result })
        })

        // Person specific booking data
        app.get('/myBookings', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            const decodedEmail = req.decoded.email;

            // Check the email with decoded email
            if (decodedEmail === patient) {
                const query = { userEmail: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'Forbidden Access' });
            }
        })

        // Store user data
        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email }
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);

            // Generate a jwt
            const token = jwt.sign({ email: email }, process.env.SECRET, {
                expiresIn: '1d',
            })
            res.send({ result, token });
        })

        // Get all users
        app.get('/allUsers', verifyJWT, async (req, res) => {
            const query = {}
            const result = userCollection.find(query);
            const users = await result.toArray();
            res.send(users);
        })

        // Make admin role
        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            const filter = { email: email }
            const updateDoc = {
                $set: { role: 'admin' },
            };
            const result = await userCollection.updateOne(filter, updateDoc);
            res.send(result);
        })

        // Check admin or not
        app.get('/user/admin/:email', verifyJWT, async (req, res) => {
            const email = req.params.email;
            const user = await userCollection.findOne({ email: email })
            const isAdmin = user.role === 'admin';
            res.send({ admin: isAdmin })
        })

        // New doctor add API
        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
            const newDoctor = req.body;
            const result = await doctorCollection.insertOne(newDoctor);
            res.send(result);
        })

        // Load all doctors API
        app.get('/doctors', verifyJWT, verifyAdmin, async (req, res) => {
            const doctors = await doctorCollection.find({}).toArray();
            res.send(doctors);
        })

        // Delete a doctor API
        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const doctor = req.params.email;
            const filter = { email: doctor };
            const result = await doctorCollection.deleteOne(filter)
            res.send(result);
        })

    }
    finally { }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('Doctors Portal server is up and running')
})

app.listen(port, () => {
    console.log(`Doctors Portal server is up and running on port ${port}`)
})
