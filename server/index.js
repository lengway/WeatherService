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

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const VALID_FIELDS = ["temperature", "humidity", "pressure"];

function isValidDate(dateString) {
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(dateString)) return false;
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date);
}

app.get("/api/measurements", async (req, res) => {
    try {
        const { field, start_date, end_date } = req.query;

        if (field && !VALID_FIELDS.includes(field)) {
            return res.status(400).json({
                error: "Invalid field name",
                message: `Field must be one of: ${VALID_FIELDS.join(", ")}`,
            });
        }

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

        const query = {};
        if (Object.keys(dateFilter).length > 0) {
            query.timestamp = dateFilter;
        }

        const measurements = await Measurement.find(query)
            .sort({ timestamp: 1 })
            .lean();

        if (measurements.length === 0) {
            return res.status(404).json({
                error: "No data found",
                message: "No measurements found for the specified criteria",
            });
        }

        if (field) {
            const result = measurements.map(m => ({
                timestamp: m.timestamp,
                [field]: m[field],
            }));
            return res.json(result);
        }

        res.json(measurements);
    } catch (error) {
        console.error("Error fetching measurements:", error);
        res.status(500).json({
            error: "Internal server error",
            message: "An error occurred while fetching data",
        });
    }
});

app.get("/api/measurements/metrics", async (req, res) => {
    try {
        const { field, start_date, end_date } = req.query;

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

        const matchStage = {};
        if (Object.keys(dateFilter).length > 0) {
            matchStage.timestamp = dateFilter;
        }

        const aggregationResult = await Measurement.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    avg: { $avg: `$${field}` },
                    min: { $min: `$${field}` },
                    max: { $max: `$${field}` },
                    stdDev: { $stdDevPop: `$${field}` },
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

        const { avg, min, max, stdDev, count } = aggregationResult[0];

        res.json({
            field,
            count,
            avg: Math.round(avg * 100) / 100,
            min: Math.round(min * 100) / 100,
            max: Math.round(max * 100) / 100,
            stdDev: Math.round((stdDev || 0) * 100) / 100,
        });
    } catch (error) {
        console.error("Error calculating metrics:", error);
        res.status(500).json({
            error: "Internal server error",
            message: "An error occurred while calculating metrics",
        });
    }
});

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

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.use("/api/{*splat}", (req, res) => {
    res.status(404).json({
        error: "Not found",
        message: "API endpoint not found",
    });
});

app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    res.status(500).json({
        error: "Internal server error",
        message: "An unexpected error occurred",
    });
});

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
