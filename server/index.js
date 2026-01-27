import express from "express";
import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import Measurement from "../models/Measurement.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.mongodb_uri;

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Valid fields for querying
const VALID_FIELDS = ["temperature", "humidity", "pressure"];

// Helper function to calculate standard deviation
function calculateStdDev(values, mean) {
    if (values.length === 0) return 0;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
}

// Validate date format (YYYY-MM-DD)
function isValidDate(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

// API: Get measurements with filtering by field and date range
// GET /api/measurements?field=temperature&start_date=2025-01-01&end_date=2025-01-31
app.get("/api/measurements", async (req, res) => {
    try {
        const { field, start_date, end_date } = req.query;

        // Validate field parameter
        if (field && !VALID_FIELDS.includes(field)) {
            return res.status(400).json({
                error: "Invalid field name",
                message: `Field must be one of: ${VALID_FIELDS.join(", ")}`,
            });
        }

        // Build date filter
        const dateFilter = {};
        if (start_date) {
            if (!isValidDate(start_date)) {
                return res.status(400).json({
                    error: "Invalid start_date format",
                    message: "Date must be in YYYY-MM-DD format",
                });
            }
            dateFilter.$gte = new Date(start_date);
        }
        if (end_date) {
            if (!isValidDate(end_date)) {
                return res.status(400).json({
                    error: "Invalid end_date format",
                    message: "Date must be in YYYY-MM-DD format",
                });
            }
            // Set end_date to end of day
            const endDateTime = new Date(end_date);
            endDateTime.setHours(23, 59, 59, 999);
            dateFilter.$lte = endDateTime;
        }

        // Build query
        const query = {};
        if (Object.keys(dateFilter).length > 0) {
            query.timestamp = dateFilter;
        }

        // Fetch data
        const measurements = await Measurement.find(query)
            .sort({ timestamp: 1 })
            .lean();

        if (measurements.length === 0) {
            return res.status(404).json({
                error: "No data found",
                message: "No measurements found for the specified criteria",
            });
        }

        // If specific field requested, return only that field with timestamp
        if (field) {
            const result = measurements.map(m => ({
                timestamp: m.timestamp,
                [field]: m[field],
            }));
            return res.json(result);
        }

        // Return all fields
        res.json(measurements);
    } catch (error) {
        console.error("Error fetching measurements:", error);
        res.status(500).json({
            error: "Internal server error",
            message: "An error occurred while fetching data",
        });
    }
});

// API: Get metrics for a specific field
// GET /api/measurements/metrics?field=temperature&start_date=2025-01-01&end_date=2025-01-31
app.get("/api/measurements/metrics", async (req, res) => {
    try {
        const { field, start_date, end_date } = req.query;

        // Validate field parameter (required for metrics)
        if (!field) {
            return res.status(400).json({
                error: "Missing field parameter",
                message: `Field is required. Must be one of: ${VALID_FIELDS.join(", ")}`,
            });
        }

        if (!VALID_FIELDS.includes(field)) {
            return res.status(400).json({
                error: "Invalid field name",
                message: `Field must be one of: ${VALID_FIELDS.join(", ")}`,
            });
        }

        // Build date filter
        const dateFilter = {};
        if (start_date) {
            if (!isValidDate(start_date)) {
                return res.status(400).json({
                    error: "Invalid start_date format",
                    message: "Date must be in YYYY-MM-DD format",
                });
            }
            dateFilter.$gte = new Date(start_date);
        }
        if (end_date) {
            if (!isValidDate(end_date)) {
                return res.status(400).json({
                    error: "Invalid end_date format",
                    message: "Date must be in YYYY-MM-DD format",
                });
            }
            const endDateTime = new Date(end_date);
            endDateTime.setHours(23, 59, 59, 999);
            dateFilter.$lte = endDateTime;
        }

        // Build match stage for aggregation
        const matchStage = {};
        if (Object.keys(dateFilter).length > 0) {
            matchStage.timestamp = dateFilter;
        }

        // Use MongoDB aggregation for metrics calculation
        const aggregationResult = await Measurement.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    avg: { $avg: `$${field}` },
                    min: { $min: `$${field}` },
                    max: { $max: `$${field}` },
                    values: { $push: `$${field}` },
                    count: { $sum: 1 },
                },
            },
        ]);

        if (aggregationResult.length === 0) {
            return res.status(404).json({
                error: "No data found",
                message: "No measurements found for the specified criteria",
            });
        }

        const { avg, min, max, values, count } = aggregationResult[0];

        // Calculate standard deviation
        const stdDev = calculateStdDev(values, avg);

        res.json({
            field,
            count,
            avg: Math.round(avg * 100) / 100,
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            stdDev: Math.round(stdDev * 100) / 100,
        });
    } catch (error) {
        console.error("Error calculating metrics:", error);
        res.status(500).json({
            error: "Internal server error",
            message: "An error occurred while calculating metrics",
        });
    }
});

// API: Get available fields
app.get("/api/fields", (req, res) => {
    res.json({
        fields: VALID_FIELDS,
        descriptions: {
            temperature: "Temperature in Celsius",
            humidity: "Humidity percentage",
            pressure: "Atmospheric pressure in hPa",
        },
    });
});

// Serve frontend
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Handle 404 for API routes (Express 5 syntax)
app.use("/api/{*splat}", (req, res) => {
    res.status(404).json({
        error: "Not found",
        message: "API endpoint not found",
    });
});

// Global error handler
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
        error: "Internal server error",
        message: "An unexpected error occurred",
    });
});

// Connect to MongoDB and start server
async function startServer() {
    try {
        if (!MONGO_URI) {
            console.error("Error: mongodb_uri environment variable is not set");
            console.log("Please create a .env file with mongodb_uri=your_connection_string");
            process.exit(1);
        }

        await mongoose.connect(MONGO_URI);
        console.log("Connected to MongoDB");

        app.listen(PORT, () => {
            console.log(`Server is running on http://localhost:${PORT}`);
        });
    } catch (error) {
        console.error("Failed to connect to MongoDB:", error);
        process.exit(1);
    }
}

startServer();
