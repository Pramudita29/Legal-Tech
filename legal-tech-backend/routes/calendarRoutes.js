import express from "express";
import {
  createCalendarEvent,
  getAllCalendarEvents,
  getCalendarEventById,
  updateCalendarEvent,
  deleteCalendarEvent
} from "../controllers/calendarController.js";

const router = express.Router();

// Create
router.post("/", createCalendarEvent);

// Read
router.get("/", getAllCalendarEvents);
router.get("/:id", getCalendarEventById);

// Update
router.put("/:id", updateCalendarEvent);

// Delete
router.delete("/:id", deleteCalendarEvent);

export default router;
