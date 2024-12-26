import mongoose from "mongoose";

const userSchema = new mongoose.Schema({
    username: {type: String, required: true},
    discordId: {type: String, required: true, unique: true},
    score: {type: Number, default: 0},
});

const User = mongoose.model("User", userSchema);
export default User;