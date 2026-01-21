import mongoose from "mongoose";
import Measurement from "../models/Measurement.js";
import dotenv from "dotenv";

dotenv.config();
const MONGO_URI = process.env.mongodb_uri;
const WEATHER_API_KEY = process.env.open_weather_api_key;

const CITY = "ASTANA";
const WEATHER_API_URL = `https://api.openweathermap.org/data/2.5/weather?q=${CITY}&appid=${WEATHER_API_KEY}&units=metric`;

async function fetchWeatherData() {
    try {
        const res = await fetch(WEATHER_API_URL);
        const data = await res.json();

        await mongoose.connect(MONGO_URI);

        await Measurement.create({
            timestamp: new Date(data.dt * 1000),
            temperature: data.main.temp,
            humidity: data.main.humidity,
            pressure: data.main.pressure,
        });

        console.log("Weather data collected and stored successfully.");
        process.exit(0);
    } catch (error) {
        console.error("Error fetching weather data:", error);
        process.exit(1);
    }
}

fetchWeatherData();