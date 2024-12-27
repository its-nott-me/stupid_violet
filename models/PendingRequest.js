import mongoose from "mongoose";

const pendingRequestSchema = new mongoose.Schema({
    id: { type: String, required: true, unique: true },
    type: { type: String, required: true }, // "points_add", "task_do", "task_edit", "task_new"
    requesterId: { type: String, required: true },
    requesterUsername: { type: String, required: true },
    approverId: { type: String },
    approverUsername: { type: String },
    points: { type: Number, required: true },
    description: { type: String }, // Only for "do" and "add/edit task" requests
    status: { type: String, default: "pending" }, // "pending", "approved", "rejected"
    createdAt: { type: Date, default: Date.now },
    taskId: { type: String }
});

export default mongoose.model("PendingRequest", pendingRequestSchema);
