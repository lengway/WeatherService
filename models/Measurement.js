import mongoose from "mongoose";

const measurementSchema = new mongoose.Schema({
    timestamp: { type: Date, required: true },
    temperature: { type: Number, required: true },
    humidity: { type: Number, required: true },
    pressure: { type: Number, required: true },
});

const Measurement = mongoose.model("Measurement", measurementSchema);

export default Measurement;