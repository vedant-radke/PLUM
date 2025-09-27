import express from 'express';
import reportRoutes from './routes/report.routes.js';
import 'dotenv/config'; 

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware 
app.use(express.json()); 

app.use('/api', reportRoutes);

// Route
app.get('/', (req, res) => {
    res.send('AI-Powered Medical Report Simplifier Service is running. Use POST /api/simplify.');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});