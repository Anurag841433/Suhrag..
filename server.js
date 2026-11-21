const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const app = express();
app.use(cors());
app.use(express.json());

// ================= CONFIG =================
const PORT = 5000;
const MONGO_URI = "mongodb://127.0.0.1:27017/suhrag_healthtech";
const JWT_SECRET = "suhrag_secret_key_2026";

const locationCodes = {
  "Kishanganj": "KNE",
  "Chhapra": "CPR",
  "Patna": "PNBE",
  "Aurangabad": "AUBR"
};

// ================= MONGODB SCHEMAS =================
const patientSchema = new mongoose.Schema({
  patientId: { type: String, unique: true, required: true }, // P101
  fullName: { type: String, required: true },
  phone: { type: String, unique: true, required: true },
  email: { type: String },
  passwordHash: { type: String, required: true },
  dob: { type: String },
  state: { type: String, default: "Bihar" },
  district: { type: String },
  village: { type: String },
  familyMembers: [{
    patientId: String,
    name: String,
    relation: String,
    dob: String,
    age: Number,
    gender: String,
    phone: String
  }]
}, { timestamps: true });

const bookingSchema = new mongoose.Schema({
  bookingId: { type: String, unique: true, required: true }, // KNE-20261114-00001
  patientId: { type: String, required: true },
  patientName: { type: String, required: true },
  doctorId: { type: String, required: true },
  doctorName: { type: String, required: true },
  clinicId: { type: String, required: true },
  clinicName: { type: String, required: true },
  locationCode: { type: String, required: true },
  bookingType: { type: String, enum: ["New", "Follow-up"], required: true },
  bookingDate: { type: String, required: true },
  tokenNumber: { type: Number, required: true },
  fee: { type: Number, required: true },
  paymentStatus: { type: String, default: "Paid" },
  bookingStatus: {
    type: String,
    enum: ["Confirmed", "Waiting", "In Consultation", "Completed", "Cancelled", "No Show"],
    default: "Confirmed"
  },
  prescriptionId: { type: String, default: null }
}, { timestamps: true });

const prescriptionSchema = new mongoose.Schema({
  prescriptionId: { type: String, unique: true, required: true }, // RX-2026-00501
  bookingId: { type: String, required: true },
  patientId: { type: String, required: true },
  patientName: { type: String, required: true },
  doctorId: { type: String, required: true },
  doctorName: { type: String, required: true },
  clinicId: { type: String, required: true },
  clinicName: { type: String, required: true },
  visitDate: { type: String, required: true },
  validityDays: { type: Number, default: 25 },
  validTill: { type: String, required: true },
  followUpFee: { type: Number, required: true },
  diagnosis: String,
  medicines: String,
  instructions: String,
  followUpUsed: { type: Boolean, default: false }
}, { timestamps: true });

const Patient = mongoose.model("Patient", patientSchema);
const Booking = mongoose.model("Booking", bookingSchema);
const Prescription = mongoose.model("Prescription", prescriptionSchema);

// Helper: Railway-Style Booking ID (LOC-YYYYMMDD-XXXXX)
async function generateBookingId(district, dateStr) {
  const code = locationCodes[district] || "SHG";
  const compactDate = dateStr.replace(/-/g, "");
  const count = await Booking.countDocuments({ bookingDate: dateStr });
  const seq = String(count + 1).padStart(5, "0");
  return `${code}-${compactDate}-${seq}`;
}

// Auto-Seed Initial Data in MongoDB (Only if DB is empty)
async function seedInitialData() {
  const exists = await Patient.findOne({ patientId: "P101" });
  if (!exists) {
    await Patient.create({
      patientId: "P101",
      fullName: "Ramesh Kumar",
      phone: "9876543210",
      email: "ramesh.kumar@example.com",
      passwordHash: await bcrypt.hash("123456", 10),
      dob: "1998-05-14",
      state: "Bihar",
      district: "Kishanganj",
      village: "Alta Hatt, Kishanganj",
      familyMembers: [
        { patientId: "P102", name: "Sita Devi", relation: "Mother", dob: "1972-03-10", age: 54, gender: "Female", phone: "9876543211" }
      ]
    });

    await Booking.create({
      bookingId: "KNE-20261114-00001",
      patientId: "P101",
      patientName: "Ramesh Kumar",
      doctorId: "D101",
      doctorName: "Dr. Rahul Kumar",
      clinicId: "C101",
      clinicName: "City Health Clinic, Kishanganj",
      locationCode: "KNE",
      bookingType: "New",
      bookingDate: "2026-11-14",
      tokenNumber: 4,
      fee: 400,
      paymentStatus: "Paid",
      bookingStatus: "In Consultation"
    });

    await Prescription.create({
      prescriptionId: "RX-2026-00501",
      bookingId: "KNE-20261101-00042",
      patientId: "P101",
      patientName: "Ramesh Kumar",
      doctorId: "D101",
      doctorName: "Dr. Rahul Kumar",
      clinicId: "C101",
      clinicName: "City Health Clinic, Kishanganj",
      visitDate: "2026-11-01",
      validityDays: 25,
      validTill: "2026-11-26",
      followUpFee: 150,
      diagnosis: "Seasonal Fever & Weakness",
      medicines: "1. Tab. Paracetamol 650mg SOS\n2. Cap. Multivitamin (1-0-0)",
      instructions: "26 Nov 2026 se pehle follow-up valid hai.",
      followUpUsed: false
    });
    console.log("Initial Sample Data Saved in MongoDB!");
  }
}

// ================= PATIENT APIs =================

// 1. Register
app.post("/api/patient/register", async (req, res) => {
  try {
    const { fullName, phone, email, password, dob, state, district, village } = req.body;
    if (await Patient.findOne({ phone })) return res.status(400).json({ message: "Phone already registered" });

    const count = await Patient.countDocuments();
    const patientId = `P${101 + count}`;
    const passwordHash = await bcrypt.hash(password, 10);

    const patient = await Patient.create({ patientId, fullName, phone, email, passwordHash, dob, state, district, village });
    res.status(201).json({ message: "Registered successfully", patientId: patient.patientId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 2. Login
app.post("/api/patient/login", async (req, res) => {
  try {
    const { phone, password } = req.body;
    const patient = await Patient.findOne({ phone });
    if (!patient || !(await bcrypt.compare(password, patient.passwordHash))) {
      return res.status(401).json({ message: "Invalid phone or password" });
    }
    const token = jwt.sign({ id: patient._id, patientId: patient.patientId }, JWT_SECRET, { expiresIn: "7d" });
    res.json({ token, patient });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3. New Consultation Booking
app.post("/api/patient/bookings/new", async (req, res) => {
  try {
    const { patientId, patientName, doctorId, doctorName, clinicId, clinicName, district, bookingDate, tokenNumber, fee } = req.body;

    const taken = await Booking.findOne({ doctorId, bookingDate, tokenNumber, bookingStatus: { $ne: "Cancelled" } });
    if (taken) return res.status(400).json({ message: `Token #${tokenNumber} already booked!` });

    const bookingId = await generateBookingId(district, bookingDate);
    const booking = await Booking.create({
      bookingId, patientId, patientName, doctorId, doctorName, clinicId, clinicName,
      locationCode: locationCodes[district] || "SHG",
      bookingType: "New", bookingDate, tokenNumber, fee, paymentStatus: "Paid", bookingStatus: "Confirmed"
    });

    res.status(201).json({ message: "Booking Confirmed", booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Verify Follow-up Prescription
app.post("/api/patient/prescriptions/verify", async (req, res) => {
  try {
    const { prescriptionId, patientId, doctorId, currentDate } = req.body;
    const rx = await Prescription.findOne({ prescriptionId: prescriptionId.toUpperCase(), patientId, doctorId });

    if (!rx) return res.status(404).json({ valid: false, message: "Prescription record not found." });
    if (rx.followUpUsed) return res.status(400).json({ valid: false, message: "Follow-up already used on this prescription." });
    if (currentDate > rx.validTill) return res.status(400).json({ valid: false, message: `Validity expired on ${rx.validTill}. Book New Consultation.` });

    res.json({ valid: true, prescription: rx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 5. Confirm Follow-up Booking
app.post("/api/patient/bookings/followup", async (req, res) => {
  try {
    const { prescriptionId, district, bookingDate, tokenNumber } = req.body;
    const rx = await Prescription.findOne({ prescriptionId });
    if (!rx || rx.followUpUsed || bookingDate > rx.validTill) {
      return res.status(400).json({ message: "Invalid or expired prescription." });
    }

    const bookingId = await generateBookingId(district, bookingDate);
    const booking = await Booking.create({
      bookingId, patientId: rx.patientId, patientName: rx.patientName,
      doctorId: rx.doctorId, doctorName: rx.doctorName, clinicId: rx.clinicId, clinicName: rx.clinicName,
      locationCode: locationCodes[district] || "SHG",
      bookingType: "Follow-up", bookingDate, tokenNumber, fee: rx.followUpFee,
      paymentStatus: "Paid", bookingStatus: "Confirmed", prescriptionId: rx.prescriptionId
    });

    rx.followUpUsed = true;
    await rx.save();

    res.status(201).json({ message: "Follow-up Booking Confirmed", booking });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Get History & Prescriptions
app.get("/api/patient/:patientId/records", async (req, res) => {
  try {
    const bookings = await Booking.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
    const prescriptions = await Prescription.find({ patientId: req.params.patientId }).sort({ createdAt: -1 });
    res.json({ bookings, prescriptions });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Add Family Member
app.post("/api/patient/:patientId/family", async (req, res) => {
  try {
    const patient = await Patient.findOne({ patientId: req.params.patientId });
    if (!patient) return res.status(404).json({ message: "Patient not found" });

    const memberPatientId = `P${102 + patient.familyMembers.length}`;
    patient.familyMembers.push({ patientId: memberPatientId, ...req.body });
    await patient.save();

    res.status(201).json({ message: "Family member added", familyMembers: patient.familyMembers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 8. Update Profile
app.put("/api/patient/:patientId/profile", async (req, res) => {
  try {
    const updated = await Patient.findOneAndUpdate(
      { patientId: req.params.patientId },
      req.body,
      { new: true }
    );
    res.json({ message: "Profile updated", patient: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/", (req, res) => res.send("Suhrag Patient Backend Connected to MongoDB!"));

// ================= START SERVER =================
mongoose.connect(MONGO_URI)
  .then(async () => {
    console.log("MongoDB Connected Successfully!");
    await seedInitialData();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Test API: http://localhost:${PORT}/api/patient/P101/records`);
    });
  })
  .catch(err => console.error("MongoDB Connection Error:", err));