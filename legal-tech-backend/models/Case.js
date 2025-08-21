// models/case.js (ESM)
import mongoose from "mongoose";

const { Schema, Types } = mongoose;

const CaseSchema = new Schema(
  {
    // Multi-tenant safety (optional but highly recommended)
    tenantId: { type: Types.ObjectId, ref: "Tenant", index: true },

    // Core identifiers
    caseNumber: { type: String, required: true, unique: true }, // e.g., "२०७९–ऋण–०१२३४"
    caseTitle: { type: String }, // e.g., "Gopal Thapa v. Ramesh Shrestha"

    courtLevel: {
      type: String,
      enum: ["District", "High", "Supreme"],
      required: true,
    },

    // Keep your original case types
    caseType: {
      type: String,
      enum: [
        // Civil Cases
        "Civil - Property",
        "Civil - Family/Divorce",
        "Civil - Inheritance",
        "Civil - Contract",
        "Civil - Land/Partition",
        "Civil - Torts",
        "Civil - Other",

        // Criminal Cases
        "Criminal - Murder",
        "Criminal - Theft/Robbery",
        "Criminal - Rape",
        "Criminal - Fraud",
        "Criminal - Corruption",
        "Criminal - Drugs/Smuggling",
        "Criminal - Cybercrime",
        "Criminal - Other",

        // Constitutional / Writ
        "Writ - Habeas Corpus",
        "Writ - Mandamus",
        "Writ - Certiorari",
        "Writ - Prohibition",
        "Writ - Quo Warranto",

        // Administrative / Service-related
        "Administrative - Public Service",
        "Administrative - Employment/Service",
        "Administrative - Tax/Revenue",
        "Administrative - Licensing/Permits",

        // Commercial / Corporate
        "Commercial - Company",
        "Commercial - Banking/Finance",
        "Commercial - Foreign Investment",
        "Commercial - Trade/Contract",
        "Commercial - Intellectual Property",

        // Family & Personal
        "Family - Marriage/Divorce",
        "Family - Adoption",
        "Family - Domestic Violence",
        "Family - Custody/Guardianship",

        // Environmental & Land
        "Environmental - Pollution",
        "Environmental - Land Use",
        "Environmental - Forest/Wildlife",
        "Environmental - Climate/Disaster",

        // Human Rights
        "Human Rights - Equality",
        "Human Rights - Freedom of Expression",
        "Human Rights - Minority Rights",
        "Human Rights - Other",

        // Election Cases
        "Election - Local",
        "Election - Provincial",
        "Election - Federal",

        // Miscellaneous
        "Miscellaneous - Contempt of Court",
        "Miscellaneous - Arbitration/ADR",
        "Miscellaneous - Other",
      ],
      required: true,
    },

    status: {
      type: String,
      enum: ["Pending", "Ongoing", "Closed", "Appealed"],
      default: "Pending",
      index: true,
    },

    // Case lineage (for appeals / higher courts)
    parentCaseId: { type: Types.ObjectId, ref: "Case" }, // link to lower court case
    appealCaseId: { type: Types.ObjectId, ref: "Case" }, // link to higher court appeal

    // Parties
    parties: [
      {
        name: { type: String },
        role: {
          type: String,
          enum: ["Plaintiff", "Defendant", "Third Party", "Appellant", "Respondent"],
        },
        lawyer: { type: Types.ObjectId, ref: "User" },
        contactInfo: String,
      },
    ],

    // Important dates
    dates: {
      filedAD: Date,
      filedBS: String,
      nextHearingAD: Date,
      nextHearingBS: String,
      judgmentAD: Date,
      judgmentBS: String,
    },

    // Optional quick hearing/events tracker
    hearings: [
      {
        dateAD: Date,
        dateBS: String,
        description: String,
        orderDoc: { type: Types.ObjectId, ref: "Document" },
      },
    ],

    // Related documents
    documents: [{ type: Types.ObjectId, ref: "Document" }],

    // Assigned staff
    assignedTo: [{ userId: { type: Types.ObjectId, ref: "User" }, role: String }],

  },
  { timestamps: true }
);

// Helpful indexes
CaseSchema.index({ tenantId: 1, caseNumber: 1 }, { unique: true });
CaseSchema.index({ tenantId: 1, status: 1 });
CaseSchema.index({ tenantId: 1, "dates.nextHearingAD": 1 });

export default mongoose.model("Case", CaseSchema);
