// models/CalendarEvent.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const HearingSchema = new Schema({
  date: { type: Date, required: true },
  type: { type: String },      // e.g., PESI, SATA, HAJIR
  remark: { type: String },
});

const CalendarEventSchema = new Schema(
  {
    caseName: { type: String, required: true },
    court: { type: String, required: true },
    hearings: [HearingSchema], // multiple hearings per case
  },
  { timestamps: true }
);

export default mongoose.model("CalendarEvent", CalendarEventSchema);
