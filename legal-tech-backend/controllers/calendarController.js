import CalendarEvent from "../models/CalendarEvent.js";

// Create a new calendar event
export const createCalendarEvent = async (req, res) => {
  try {
    const newEvent = new CalendarEvent(req.body);
    const savedEvent = await newEvent.save();
    res.status(201).json(savedEvent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Get all calendar events
export const getAllCalendarEvents = async (req, res) => {
  try {
    const events = await CalendarEvent.find().sort({ "hearings.date": 1 }); // optional: sort by hearing date
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Get a single calendar event by ID
export const getCalendarEventById = async (req, res) => {
  try {
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });
    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// Update a calendar event
export const updateCalendarEvent = async (req, res) => {
  try {
    const updatedEvent = await CalendarEvent.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!updatedEvent) return res.status(404).json({ error: "Event not found" });
    res.json(updatedEvent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// Delete a calendar event
export const deleteCalendarEvent = async (req, res) => {
  try {
    const deleted = await CalendarEvent.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: "Event not found" });
    res.json({ message: "Calendar event deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
