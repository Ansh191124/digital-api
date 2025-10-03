import mongoose from "mongoose";

const recordingSchema = new mongoose.Schema({
  Sid: String,
  RecordingUrl: String,
  CreatedAt: String,
});

const leadDetailsSchema = new mongoose.Schema({
  product_interest: String,
  customer_need: String,
});

const appointmentDetailsSchema = new mongoose.Schema({
  patient_name: String,
  disease: String,
  doctor_name: String,
  appointment_date: String,
  appointment_time: String,
});

const callSchema = new mongoose.Schema({
  Sid: String,
  From: String,
  To: String,
  Status: String,
  StartTime: Date,
  EndTime: Date,
  Duration: String,
  Direction: String,
  VirtualNumber: String,
  transcription: String,
  Notes: String,
  recordings: [recordingSchema],
  is_lead: { type: Boolean, default: false },
  lead_details: leadDetailsSchema,
  is_appointment: { type: Boolean, default: false },
  appointment_details: appointmentDetailsSchema,
  is_processed: { type: Boolean, default: false },
});

const Call = mongoose.model("Call", callSchema);

export default Call;