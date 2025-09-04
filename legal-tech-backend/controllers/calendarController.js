// controllers/calendarController.js
import CalendarEvent from "../models/CalendarEvent.js";

// --- Create a new calendar event ---
export const createCalendarEvent = async (req, res) => {
  try {
    const userId = req.user._id; // from requireAuth
    const orgId = req.user.orgId;

    const newEvent = new CalendarEvent({
      ...req.body,
      createdBy: userId,
      orgId,
    });

    const savedEvent = await newEvent.save();
    res.status(201).json(savedEvent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// --- Get all calendar events (filtered by role) ---
export const getAllCalendarEvents = async (req, res) => {
  try {
    const user = req.user;

    let filter = {};
    if (user.role === "Lawyer") {
      filter = { createdBy: user._id };
    } else if (user.role === "Admin") {
      filter = { orgId: user.orgId };
    }

    const events = await CalendarEvent.find(filter).sort({ "hearings.date": 1 });
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// --- Get single calendar event by ID ---
export const getCalendarEventById = async (req, res) => {
  try {
    const user = req.user;
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Access control
    if (user.role === "Lawyer" && !event.createdBy.equals(user._id)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (user.role === "Admin" && !event.orgId.equals(user.orgId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    res.json(event);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// --- Update calendar event ---
export const updateCalendarEvent = async (req, res) => {
  try {
    const user = req.user;
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Access control
    if (user.role === "Lawyer" && !event.createdBy.equals(user._id)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (user.role === "Admin" && !event.orgId.equals(user.orgId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    Object.assign(event, req.body);
    const updatedEvent = await event.save();
    res.json(updatedEvent);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// --- Delete calendar event ---
export const deleteCalendarEvent = async (req, res) => {
  try {
    const user = req.user;
    const event = await CalendarEvent.findById(req.params.id);
    if (!event) return res.status(404).json({ error: "Event not found" });

    // Access control
    if (user.role === "Lawyer" && !event.createdBy.equals(user._id)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    if (user.role === "Admin" && !event.orgId.equals(user.orgId)) {
      return res.status(403).json({ error: "Forbidden" });
    }

    await event.remove();
    res.json({ message: "Calendar event deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
