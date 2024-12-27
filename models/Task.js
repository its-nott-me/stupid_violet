import mongoose from "mongoose";
import autoIncrement from "mongoose-sequence"; 

const AutoIncrement = autoIncrement(mongoose); 

const taskSchema = new mongoose.Schema({
    id: {type: String, required: true},
    description: { type: String },
    requesterId: { type: String, required: true },
    requesterUsername: { type: String, required: true },
    requesterNickname: { type: String },
    approverId: { type: String, required: true },
    approverUsername: { type: String, required: true },
    approverNickname: { type: String },
    status: { type: String, default: "pending" }, // "pending", "approved", "rejected"
    points: { type: Number, required: true }, 
    createdAt: { type: Date, default: Date.now },
});

taskSchema.plugin(AutoIncrement, { inc_field: "taskId" });

export default mongoose.model("Task", taskSchema);