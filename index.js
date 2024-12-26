import express from "express";
import Discord, { GatewayIntentBits } from "discord.js";
import "dotenv/config";
import mongoose from "mongoose";
import User from "./models/User.js";

const app = express();
const port = process.env.PORT || 3000;
const client = new Discord.Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

//  mongo setup
mongoose
    .connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.log("MongoDB connection error:", err))


// Home page
app.get("/", (req, res) => {
    res.send("Hello Discord!!")
});

// Ping command
client.on("messageCreate", message => {
    if(message.content === "ping"){
        message.channel.send("pong!")
    }
});

// Add points
client.on("messsageCreate", async(message) => {
    if(message.content.startsWith("/add")){
        const args = message.content.split(" ");
        const points = parseFloat(args[1]);
        const userMention = message.mentions.users.first();

        if(!points || !userMention){
            return message.channel.send("Usage: `/add <points> <@user>`")
        }
        
        try{
            const user = await User.findOneAndUpdate(
                {discordId: userMention.id},
                {$inc: {score: points}, username: userMention.username},
                {upsert: true, new: true}
            );

            message.channel.send(`${user.username} now has ${user.score} points.`);
        } catch (err) {
            console.error(err);
            message.channel.send("An error occured while updating the scoreboard.");
        }
    }
});

// Assign tasks
client.on("messageCreate", async(message) => {
    if(message.content.startsWith("/do")){
        const args = message.content.split(" ");
        const userMention = message.mentions.users.first();
        const points = parseFloat(args[1]);
        const taskDescription = args.slice(2).join(" ");

        if(!userMention || !points || !taskDescription){
            return message.channel.send("Usage: `/do <@user> <points> <task>`")
        }

        const requestingUser = message.author;
        try{
            const requester = await User.findOne({discordId: requestingUser.id})
            if(!requester || requester.score < points){
                return message.channel.send("You don't have enough points!");
            }

            await User.findOneAndUpdate(
                {discordId: userMention.id},
                {$inc: {score: points/2}, username: userMention.username},
                {upsert: true, new: true}
            );

            requester.score -= points;
            await requester.save();

            message.channel.send(
                `${userMention.username} has been assigned the task: "${taskDescription}.\n` + 
                `${Math.floor(points/2)} points were transferred to ${userMention.username}.`
            );
        } catch (err) {
            console.error(err);
            message.channel.send("An error occured while processing the task")
        }
    }
});


// Bot login
client.login(process.env.TOKEN)
    .then(() => console.log("entering the discord world"))
    .catch((err) => console.error("error logging in: ", err))

app.listen(port || 3000, () => {
    console.log(`Stupid violet reporting to service on port: ${port}`)
});