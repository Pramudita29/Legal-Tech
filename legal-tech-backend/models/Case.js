// models/case.js (ESM)
import mongoose from "mongoose";

const { Schema, Types } = mongoose;

/**
 * Multitenancy model (no Tenant collection):
 * - orgId => the organization owner’s _id (Admin user). For solo lawyers, orgId === user._id.
 * - createdBy => the user who created the case (admin or lawyer).
 * - Access rules you'll enforce in controllers:
 *   - Admin: can see/update/delete all cases with the same orgId.
 *   - Lawyer: can see cases they created, or are assigned to, or are the lawyer on a party.
 */
const CaseSchema = new Schema(
  {
    orgId: { type: Types.ObjectId, ref: "User", required: true, index: true },

    // Core identifiers
    caseNumber: { type: String, required: true }, // uniqueness enforced per org
    caseTitle: { type: String },

    courtLevel: {
      type: String,
      enum: ["District", "High", "Supreme"],
      required: true,
    },

    // Case types (unchanged)
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

    // Case lineage
    parentCaseId: { type: Types.ObjectId, ref: "Case" },
    appealCaseId: { type: Types.ObjectId, ref: "Case" },

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

    // Hearings
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

    // Who created this case (used for lawyer scoping)
    createdBy: { type: Types.ObjectId, ref: "User", index: true },
  },
  { timestamps: true }
);

// Indexes (per-organization scoping)
CaseSchema.index({ orgId: 1, caseNumber: 1 }, { unique: true }); // per-org unique case number
CaseSchema.index({ orgId: 1, status: 1 });
CaseSchema.index({ orgId: 1, "dates.nextHearingAD": 1 });
CaseSchema.index({ orgId: 1, "assignedTo.userId": 1 });
CaseSchema.index({ orgId: 1, "parties.lawyer": 1 });
CaseSchema.index({ orgId: 1, createdBy: 1 });

export default mongoose.model("Case", CaseSchema);
