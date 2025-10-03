// router.js - Final Exotel/OpenAI/Appointment Router

import express from "express";
import axios from "axios";
import Call from "../models/models.js";
import dotenv from "dotenv";
import OpenAI from "openai";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import os from "os";
import mongoose from "mongoose";
// 1. IMPORT AUTHENTICATION MIDDLEWARE
import { authenticateToken } from "./auth.js";
// 2. IMPORT AUTHENTICATION ROUTER
import authRouter from "./auth.js"; // This imports the default export (the router) from auth.js
 
dotenv.config();

const router = express.Router();

// ----------------------------------------------------
// --- ROUTER INTEGRATION (THE FIX) ---
// ----------------------------------------------------

// This line integrates the authentication routes (login, register, verify, me)
// The routes are accessible under the /auth path of this router.
// E.g., if server.js uses app.use("/api", router), the login path is: /api/auth/login
router.use('/auth', authRouter);

// ----------------------------------------------------
// --- Exotel Credentials ---
const EXOTEL_SID = process.env.EXOTEL_SID;
const EXOTEL_USER = process.env.EXOTEL_USER;
const EXOTEL_TOKEN = process.env.EXOTEL_TOKEN;
const EXOTEL_NUMBER = process.env.EXOTEL_NUMBER;
const CALLFLOW_SID = process.env.CALLFLOW_SID;

// FIX: Corrected template literal syntax for auth header
const auth = Buffer.from(`${EXOTEL_USER}:${EXOTEL_TOKEN}`).toString("base64");
const headers = { Authorization: `Basic ${auth}` };

// --- OpenAI Configuration ---
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

// --- Appointment Schema ---
const appointmentSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    client_name: { type: String, required: true },
    phone: { type: String, required: true },
    reason: { type: String, required: true },
    status: {
        type: String,
        enum: ["Confirmed", "Pending", "Rescheduled", "Cancelled"],
        default: "Pending"
    },
    date: { type: Date, required: true },
    time: { type: Date, required: true },
    insurance: { type: String, default: "Not Specified" },
    duration_seconds: { type: Number, default: 0 },
    priority: { type: String, enum: ["High Priority", null], default: null },
    created_at: { type: Date, default: Date.now },
    updated_at: { type: Date, default: Date.now },
    call_sid: { type: String },
    notes: { type: String, default: "" }
});

const Appointment = mongoose.model('Appointment', appointmentSchema);

// --- Helper Functions (No changes) ---
async function fetchExotelCalls() {
    try {
        // FIX: Corrected template literal syntax
        const res = await axios.get(
            `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls.json?PageSize=50`,
            { headers }
        );
        return res.data.Calls || [];
    } catch (err) {
        // FIX: Corrected template literal syntax
        console.error("Error fetching calls:", err.response?.data || err.message);
        return [];
    }
}

async function fetchCallDetails(callSid) {
    try {
        // FIX: Corrected template literal syntax
        const res = await axios.get(
            `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls/${callSid}.json`,
            { headers }
        );
        const call = res.data.Call || {};
        return {
            Sid: call.Sid,
            From: call.From || call.from,
            To: call.To || call.to,
            Status: call.Status || call.status,
            StartTime: call.StartTime ? new Date(call.StartTime) : null,
            EndTime: call.EndTime ? new Date(call.EndTime) : null,
            Duration: call.Duration,
            Direction: call.Direction || call.direction,
            recordings: call.RecordingUrl
                ? [
                      {
                          Sid: call.Sid,
                          RecordingUrl: call.RecordingUrl,
                          CreatedAt: new Date(),
                      },
                  ]
                : [],
        };
    } catch (err) {
        // FIX: Corrected template literal syntax
        console.error(`Error fetching call details for ${callSid}:`, err.response?.data || err.message);
        return null;
    }
}

export async function fetchAndSaveCalls() {
    try {
        const calls = await fetchExotelCalls();
        const callsWithDetails = await Promise.all(
            calls.map(async (call) => fetchCallDetails(call.Sid))
        );
        for (const call of callsWithDetails) {
            if (call) {
                await Call.findOneAndUpdate({ Sid: call.Sid }, { ...call }, { upsert: true, new: true });
            }
        }
        // FIX: Corrected template literal syntax
        console.log(`Fetched and saved ${callsWithDetails.length} calls`);
    } catch (err) {
        console.error("Error in auto-fetch:", err.message);
    }
}

async function createAppointmentFromCall(callSid, leadDetails) {
    try {
        const existingAppointment = await Appointment.findOne({ call_sid: callSid });
        if (existingAppointment) {
            // FIX: Corrected template literal syntax
            console.log(`Appointment already exists for call ${callSid}`);
            return existingAppointment;
        }

        // FIX: Corrected template literal syntax
        const appointmentId = `APT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        if (tomorrow.getDay() === 0) tomorrow.setDate(tomorrow.getDate() + 1);
        if (tomorrow.getDay() === 6) tomorrow.setDate(tomorrow.getDate() + 2);

        const appointmentDate = new Date(tomorrow);
        appointmentDate.setHours(10, 0, 0, 0);

        const appointment = new Appointment({
            id: appointmentId,
            client_name: leadDetails.customer_name,
            phone: leadDetails.phone_number,
            reason: leadDetails.product_interest || "Product Consultation",
            status: "Pending",
            date: appointmentDate,
            time: appointmentDate,
            insurance: "Not Specified",
            duration_seconds: 0,
            priority: leadDetails.confidence_score > 0.8 ? "High Priority" : null,
            call_sid: callSid,
            // FIX: Corrected template literal syntax
            notes: `Auto-created from call analysis. Customer need: ${leadDetails.customer_need || 'Not specified'}`
        });

        await appointment.save();
        // FIX: Corrected template literal syntax
        console.log(`Auto-created appointment ${appointmentId} for ${leadDetails.customer_name}`);
        return appointment;
    } catch (error) {
        console.error("Error creating appointment from call:", error);
        return null;
    }
}

// ----------------------------------------------------
// --- ROUTES (Middleware applied where needed) ---
// ----------------------------------------------------

// === CRITICAL FIX: ADD THE MISSING ANALYZE-LEAD ENDPOINT ===
// NOTE: This endpoint is likely called internally by your service
// after a transcription is complete, so it might not need auth.
// If it's called by an authenticated user interface, add authenticateToken.
router.post("/analyze-lead", async (req, res) => {
    try {
        const { callSid, transcription } = req.body;

        // FIX: Corrected template literal syntax
        console.log(`Received analyze-lead request for call: ${callSid}`);

        if (!callSid || !transcription) {
            console.log("Missing callSid or transcription");
            return res.status(400).json({
                error: "callSid and transcription are required"
            });
        }

        // FIX: Corrected template literal syntax
        console.log(`Analyzing call ${callSid} for lead information...`);

        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                {
                    role: "system",
                    content: `You are an expert AI that extracts lead information from Hindi call transcriptions.

EXTRACTION RULES:
1. NAME EXTRACTION - Look for patterns:
    - "मेरा नाम है [NAME]" → Extract [NAME]
    - "मेरा नाम [NAME] है" → Extract [NAME]  
    - "मैं [NAME] बोल रही हूँ" → Extract [NAME]
    - "नाम है [NAME]" → Extract [NAME]

2. PHONE EXTRACTION - Look for patterns:
    - "मेरा वाटसप नंबर है [NUMBER]" → Extract [NUMBER]
    - "मेरा नंबर है [NUMBER]" → Extract [NUMBER]
    - "वाटसप नंबर [NUMBER]" → Extract [NUMBER]
    - Any 10-digit number starting with 6,7,8,9

3. PRODUCT EXTRACTION - Look for: जीन्स, कपड़े, सैमपल्स, ब्लैक, clothing, collection

4. LEAD QUALIFICATION:
    - Customer wants to buy/see products = TRUE
    - Has name OR phone = TRUE
    - Only complaint/status check = FALSE

5. APPOINTMENT DETECTION - Look for: मिलना, आना, शाम को, कल, समय

RESPOND IN JSON FORMAT ONLY:
{
  "is_lead": boolean,
  "customer_name": "string",
  "phone_number": "string", 
  "product_interest": "string",
  "customer_need": "string",
  "is_appointment": boolean,
  "confidence_score": 0.5,
  "extraction_method": "gpt4o-mini-api"
}`
                },
                {
                    role: "user",
                    // FIX: Corrected template literal syntax
                    content: `ANALYZE THIS TRANSCRIPT FOR LEAD INFORMATION: "${transcription}"`
                }
            ],
            response_format: { type: "json_object" },
            temperature: 0.0,
            max_tokens: 1000
        });

        const aiResult = JSON.parse(completion.choices[0].message.content);
        // FIX: Corrected template literal syntax
        console.log(`Raw AI result for ${callSid}:`, aiResult);

        // Clean up the extracted data
        if (aiResult.customer_name) {
            aiResult.customer_name = aiResult.customer_name.trim();
        }
        if (aiResult.phone_number) {
            aiResult.phone_number = aiResult.phone_number.replace(/\D/g, '').substring(0, 10);
            if (aiResult.phone_number.length !== 10 || !/^[6-9]/.test(aiResult.phone_number)) {
                aiResult.phone_number = "";
            }
        }

        // Calculate confidence score
        let confidenceScore = 0.3;
        if (aiResult.customer_name) confidenceScore += 0.4;
        if (aiResult.phone_number) confidenceScore += 0.4;
        if (aiResult.product_interest) confidenceScore += 0.2;
        aiResult.confidence_score = Math.min(1.0, confidenceScore);
        aiResult.extraction_method = "gpt4o-mini-api";

        // FIX: Corrected template literal syntax
        console.log(`Processed result for ${callSid}:`, {
            isLead: aiResult.is_lead,
            name: aiResult.customer_name,
            phone: aiResult.phone_number,
            confidence: aiResult.confidence_score
        });

        // Update the call in database
        await Call.findOneAndUpdate(
            { Sid: callSid },
            {
                $set: {
                    is_lead: aiResult.is_lead,
                    is_appointment: aiResult.is_appointment || false,
                    lead_analysis_at: new Date(),
                    confidence_score: aiResult.confidence_score,
                    extraction_method: "gpt4o-mini-api",
                    lead_details: aiResult.is_lead ? {
                        customer_name: aiResult.customer_name || "",
                        phone_number: aiResult.phone_number || "",
                        product_interest: aiResult.product_interest || "",
                        customer_need: aiResult.customer_need || "",
                        confidence_score: aiResult.confidence_score,
                        extraction_method: "gpt4o-mini-api",
                        analysis_timestamp: new Date()
                    } : undefined
                }
            },
            { new: true }
        );

        // Create appointment if detected
        if (aiResult.is_appointment && aiResult.customer_name && aiResult.phone_number) {
            await createAppointmentFromCall(callSid, aiResult);
        }

        // FIX: Corrected template literal syntax
        console.log(`Analysis complete for ${callSid}`);
        res.json(aiResult);

    } catch (error) {
        // FIX: Corrected template literal syntax
        console.error(`Error analyzing call ${req.body.callSid || 'unknown'}:`, error);
        res.status(500).json({
            error: "Failed to analyze call for lead information",
            details: error.message
        });
    }
});

// --- APPOINTMENT ROUTES ---
// 🔒 Protected: Requires authentication to view appointments
router.get("/appointments", authenticateToken, async (req, res) => {
    try {
        const {
            status,
            date,
            client_name,
            phone,
            page = 1,
            limit = 20,
            sort_by = "date",
            sort_order = "desc"
        } = req.query;

        let query = {};

        if (status && status !== "All") {
            query.status = status;
        }

        if (date) {
            const selectedDate = new Date(date);
            const nextDate = new Date(selectedDate);
            nextDate.setDate(nextDate.getDate() + 1);
            query.date = {
                $gte: selectedDate,
                $lt: nextDate
            };
        }

        if (client_name) {
            query.client_name = { $regex: client_name, $options: "i" };
        }

        if (phone) {
            query.phone = { $regex: phone, $options: "i" };
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortObj = {};
        sortObj[sort_by] = sort_order === "desc" ? -1 : 1;

        const appointments = await Appointment.find(query)
            .sort(sortObj)
            .skip(skip)
            .limit(parseInt(limit));

        const total = await Appointment.countDocuments(query);

        const stats = await Appointment.aggregate([
            {
                $group: {
                    _id: "$status",
                    count: { $sum: 1 }
                }
            }
        ]);

        const statusStats = {
            total: total,
            confirmed: 0,
            pending: 0,
            rescheduled: 0,
            cancelled: 0
        };

        stats.forEach(stat => {
            statusStats[stat._id.toLowerCase()] = stat.count;
        });

        res.json({
            appointments,
            pagination: {
                current_page: parseInt(page),
                total_pages: Math.ceil(total / parseInt(limit)),
                total_appointments: total,
                per_page: parseInt(limit)
            },
            stats: statusStats
        });
    } catch (error) {
        console.error("Error fetching appointments:", error);
        res.status(500).json({ error: "Failed to fetch appointments" });
    }
});

// 🔒 Protected: Requires authentication to create appointments manually
router.post("/appointments", authenticateToken, async (req, res) => {
    try {
        const {
            client_name,
            phone,
            reason,
            date,
            time,
            insurance,
            priority,
            notes
        } = req.body;

        if (!client_name || !phone || !reason || !date || !time) {
            return res.status(400).json({
                error: "Missing required fields: client_name, phone, reason, date, time"
            });
        }

        // FIX: Corrected template literal syntax
        const appointmentId = `APT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

        const appointment = new Appointment({
            id: appointmentId,
            client_name,
            phone,
            reason,
            date: new Date(date),
            time: new Date(time),
            insurance: insurance || "Not Specified",
            priority: priority || null,
            notes: notes || ""
        });

        await appointment.save();

        // FIX: Corrected template literal syntax
        console.log(`Created new appointment: ${appointmentId} for ${client_name}`);
        res.status(201).json(appointment);
    } catch (error) {
        console.error("Error creating appointment:", error);
        res.status(500).json({ error: "Failed to create appointment" });
    }
});

// 🔒 Protected: Requires authentication to update appointments
router.put("/appointments/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = { ...req.body, updated_at: new Date() };

        const appointment = await Appointment.findOneAndUpdate(
            { id: id },
            updateData,
            { new: true, runValidators: true }
        );

        if (!appointment) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        // FIX: Corrected template literal syntax
        console.log(`Updated appointment: ${id}`);
        res.json(appointment);
    } catch (error) {
        console.error("Error updating appointment:", error);
        res.status(500).json({ error: "Failed to update appointment" });
    }
});

// 🔒 Protected: Requires authentication to delete appointments
router.delete("/appointments/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const appointment = await Appointment.findOneAndDelete({ id: id });

        if (!appointment) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        // FIX: Corrected template literal syntax
        console.log(`Deleted appointment: ${id}`);
        res.json({ message: "Appointment deleted successfully" });
    } catch (error) {
        console.error("Error deleting appointment:", error);
        res.status(500).json({ error: "Failed to delete appointment" });
    }
});

// 🔒 Protected: Requires authentication to view a single appointment
router.get("/appointments/:id", authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;

        const appointment = await Appointment.findOne({ id: id });

        if (!appointment) {
            return res.status(404).json({ error: "Appointment not found" });
        }

        res.json(appointment);
    } catch (error) {
        console.error("Error fetching appointment:", error);
        res.status(500).json({ error: "Failed to fetch appointment" });
    }
});

// 🔒 Protected: Requires authentication for bulk updates
router.patch("/appointments/bulk-status", authenticateToken, async (req, res) => {
    try {
        const { appointment_ids, status } = req.body;

        if (!appointment_ids || !Array.isArray(appointment_ids) || !status) {
            return res.status(400).json({
                error: "appointment_ids (array) and status are required"
            });
        }

        const result = await Appointment.updateMany(
            { id: { $in: appointment_ids } },
            { status: status, updated_at: new Date() }
        );

        // FIX: Corrected template literal syntax
        console.log(`Bulk updated ${result.modifiedCount} appointments to status: ${status}`);
        // FIX: Corrected template literal syntax
        res.json({
            message: `Updated ${result.modifiedCount} appointments`,
            modified_count: result.modifiedCount
        });
    } catch (error) {
        console.error("Error bulk updating appointments:", error);
        res.status(500).json({ error: "Failed to update appointments" });
    }
});

// 🔒 Protected: Requires authentication to view stats
router.get("/appointments/stats/summary", authenticateToken, async (req, res) => {
    try {
        const today = new Date();
        const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const endOfDay = new Date(startOfDay);
        endOfDay.setDate(endOfDay.getDate() + 1);

        const stats = await Appointment.aggregate([
            {
                $facet: {
                    total: [{ $count: "count" }],
                    by_status: [
                        { $group: { _id: "$status", count: { $sum: 1 } } }
                    ],
                    today: [
                        {
                            $match: {
                                date: { $gte: startOfDay, $lt: endOfDay }
                            }
                        },
                        { $count: "count" }
                    ],
                    high_priority: [
                        { $match: { priority: "High Priority" } },
                        { $count: "count" }
                    ]
                }
            }
        ]);

        const result = stats[0];
        const statusCounts = {};

        result.by_status.forEach(item => {
            statusCounts[item._id.toLowerCase()] = item.count;
        });

        res.json({
            total: result.total[0]?.count || 0,
            today: result.today[0]?.count || 0,
            high_priority: result.high_priority[0]?.count || 0,
            confirmed: statusCounts.confirmed || 0,
            pending: statusCounts.pending || 0,
            rescheduled: statusCounts.rescheduled || 0,
            cancelled: statusCounts.cancelled || 0,
            cancellation_rate: result.total[0]?.count ?
                Math.round((statusCounts.cancelled || 0) / result.total[0].count * 100) : 0
        });
    } catch (error) {
        console.error("Error fetching appointment statistics:", error);
        res.status(500).json({ error: "Failed to fetch statistics" });
    }
});

// --- EXISTING ROUTES ---
// 🔒 Protected: Requires authentication to manually fetch/save calls
router.get("/fetch-calls", authenticateToken, async (req, res) => {
    await fetchAndSaveCalls();
    res.json({ message: "Calls fetched and saved successfully" });
});

// 🔒 Protected: Requires authentication to trigger batch analysis
router.get("/analyze-all-calls", authenticateToken, async (req, res) => {
    try {
        console.log("Starting batch analysis of calls for appointments...");

        const callsToAnalyze = await Call.find({
            "recordings.0.RecordingUrl": { $exists: true },
            "lead_analysis_at": { $exists: false }
        });

        // FIX: Corrected template literal syntax
        console.log(`Found ${callsToAnalyze.length} calls to analyze.`);

        for (const call of callsToAnalyze) {
            try {
                // FIX: Corrected template literal syntax
                const transcriptionResult = await axios.post(`http://localhost:4000/api/transcribe/${call.Sid}`);
                const transcript = transcriptionResult.data.text;

                if (transcript) {
                    // Use the same analyze-lead endpoint
                    // FIX: Corrected template literal syntax
                    await axios.post(`http://localhost:4000/api/analyze-lead`, {
                        callSid: call.Sid,
                        transcription: transcript
                    });
                }
            } catch (analysisError) {
                // FIX: Corrected template literal syntax
                console.error(`Error analyzing call ${call.Sid}:`, analysisError.message);
            }
        }

        console.log("Batch analysis complete.");
        // FIX: Corrected template literal syntax
        res.json({ message: `Successfully analyzed ${callsToAnalyze.length} calls.` });
    } catch (error) {
        console.error("Error in batch analysis:", error.message);
        res.status(500).json({ error: "Failed to perform batch analysis." });
    }
});

// 🔒 Protected: Requires authentication to view calls list
router.get("/calls", authenticateToken, async (req, res) => {
    try {
        const { searchId, status, direction, startDate, endDate, page = 1, limit = 20 } = req.query;
        let query = {};

        if (searchId) query.Sid = { $regex: searchId, $options: "i" };
        if (status) query.Status = status;
        if (direction) query.Direction = direction;

        if (startDate || endDate) {
            query.StartTime = {};
            if (startDate) query.StartTime.$gte = new Date(startDate);
            if (endDate) query.StartTime.$lte = new Date(endDate);
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const calls = await Call.find(query).sort({ StartTime: -1 }).skip(skip).limit(parseInt(limit));
        const total = await Call.countDocuments(query);

        res.json({
            calls,
            total,
            page: parseInt(page),
            totalPages: Math.ceil(total / limit),
        });
    } catch (err) {
        console.error("Error fetching calls from DB:", err.message);
        res.status(500).json({ error: "Failed to fetch calls from DB" });
    }
});

// 🔓 Public: Exotel status callbacks must be publicly accessible
router.post("/status-callback", async (req, res) => {
    try {
        const { CallSid, RecordingUrl, Status } = req.body;
        await Call.findOneAndUpdate(
            { Sid: CallSid },
            {
                Status,
                $push: {
                    recordings: { Sid: CallSid, RecordingUrl: RecordingUrl || null, CreatedAt: new Date() },
                },
            },
            { upsert: true, new: true }
        );
        // FIX: Corrected template literal syntax
        console.log(`Status callback received for CallSid ${CallSid}`);
        res.status(200).send("OK");
    } catch (err) {
        console.error("Error handling status callback:", err.message);
        res.status(500).send("Error");
    }
});

// 🔒 Protected: Requires authentication to manually trigger an outbound call
router.post("/outbound-call", authenticateToken, async (req, res) => {
    const { toNumber } = req.body;
    if (!toNumber) return res.status(400).json({ error: "toNumber is required" });
    try {
        const payload = new URLSearchParams();
        payload.append("From", EXOTEL_NUMBER);
        payload.append("To", toNumber);
        payload.append("CallerId", EXOTEL_NUMBER);
        payload.append("CallFlowSid", CALLFLOW_SID);
        // FIX: Corrected template literal syntax
        const response = await axios.post(
            `https://api.exotel.com/v1/Accounts/${EXOTEL_SID}/Calls/connect.json`,
            payload.toString(),
            // FIX: Corrected template literal syntax for headers
            { headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/x-www-form-urlencoded" } }
        );
        if (response.data.Call && response.data.Call.Sid) {
            const callDetails = await fetchCallDetails(response.data.Call.Sid);
            if (callDetails) await Call.findOneAndUpdate({ Sid: callDetails.Sid }, { ...callDetails }, { upsert: true, new: true });
        }
        res.json({ message: "Call initiated successfully!", data: response.data });
    } catch (err) {
        console.error("Error making outbound call:", err.response?.data || err.message);
        res.status(500).json({ error: "Failed to initiate call" });
    }
});

// 🔒 Protected: Requires authentication to access recording
router.get("/recording/:callSid", authenticateToken, async (req, res) => {
    const { callSid } = req.params;
    try {
        const callDetails = await fetchCallDetails(callSid);
        if (!callDetails || !callDetails.recordings || callDetails.recordings.length === 0) {
            return res.status(404).json({ error: "Recording not found" });
        }
        const recordingUrl = callDetails.recordings[0].RecordingUrl;
        const response = await axios.get(recordingUrl, {
            responseType: "stream",
            // FIX: Corrected template literal syntax for headers
            headers: { Authorization: `Basic ${auth}` },
        });
        res.set("Content-Type", response.headers["content-type"]);
        response.data.pipe(res);
    } catch (err) {
        console.error("Error streaming recording:", err.message);
        res.status(500).json({ error: "Failed to fetch recording" });
    }
});

// 🔒 Protected: Requires authentication to manually trigger transcription
router.post("/transcribe/:callSid", authenticateToken, async (req, res) => {
    const { callSid } = req.params;
    let tempFilePath = '';

    try {
        const existingCall = await Call.findOne({ Sid: callSid });
        if (existingCall && existingCall.transcription) {
            // FIX: Corrected template literal syntax
            console.log(`Transcription found in DB for ${callSid}. Returning cached text.`);
            return res.json({ text: existingCall.transcription });
        }

        const callDetails = await fetchCallDetails(callSid);
        if (!callDetails || !callDetails.recordings || callDetails.recordings.length === 0) {
            return res.status(404).json({ error: "Recording not found for transcription" });
        }
        const recordingUrl = callDetails.recordings[0].RecordingUrl;
        // FIX: Corrected template literal syntax
        tempFilePath = path.join(os.tmpdir(), `${callSid}.mp3`);
        const writer = fsSync.createWriteStream(tempFilePath);

        const response = await axios({
            url: recordingUrl,
            method: "GET",
            responseType: "stream",
            // FIX: Corrected template literal syntax for headers
            headers: { Authorization: `Basic ${auth}` },
        });

        response.data.pipe(writer);
        await new Promise((resolve, reject) => {
            writer.on("finish", resolve);
            writer.on("error", reject);
        });

        const stats = await fs.stat(tempFilePath);
        if (stats.size === 0) {
            throw new Error("Downloaded file is empty.");
        }

        const transcription = await openai.audio.transcriptions.create({
            file: fsSync.createReadStream(tempFilePath),
            model: "whisper-1",
        });

        await Call.findOneAndUpdate(
            { Sid: callSid },
            { $set: { transcription: transcription.text } },
            { new: true, upsert: true }
        );

        res.json({ text: transcription.text });

        try { await fs.unlink(tempFilePath); } catch (e) {}

    } catch (err) {
        console.error("Error transcribing recording:", err.message);
        res.status(500).json({ error: "Failed to transcribe recording" });
        if (tempFilePath) try { await fs.unlink(tempFilePath); } catch (e) {}
    }
});

// 🔒 Protected: Requires authentication to summarize calls
router.post("/summarize", authenticateToken, async (req, res) => {
    const { text } = req.body;
    if (!text) return res.status(400).json({ error: "text is required" });
    try {
        const completion = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            messages: [
                { role: "system", content: "You are a helpful assistant that summarizes call transcriptions concisely." },
                // FIX: Corrected template literal syntax
                { role: "user", content: `Summarize this call transcription: ${text}` }
            ],
            max_tokens: 200,
            temperature: 0.3,
        });
        res.json({ summary: completion.choices[0].message.content });
    } catch (err) {
        console.error("Error generating summary:", err.message);
        res.status(500).json({ error: "Failed to generate summary" });
    }
});

// ----------------------------------------------------
// --- FINAL EXPORT ---
// ----------------------------------------------------

// Exports the combined router as the default and the utility function fetchAndSaveCalls as named
export default router;
