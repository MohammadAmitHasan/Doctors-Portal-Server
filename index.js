const express = require('express')
const app = express()
const port = process.env.PORT || 5000;
const cors = require('cors')
require('dotenv').config()
const { MongoClient, ServerApiVersion } = require('mongodb');

// Middleware
app.use(cors())
app.use(express.json())

// Using MongoDB
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.get8p.mongodb.net/myFirstDatabase?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect()
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('booking');

        app.get('/services', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query);
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
                // 4. Get the booking slot
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