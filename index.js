import express from "express";
import Discord, { GatewayIntentBits } from "discord.js";
import "dotenv/config";

const app = express();
const port = process.env.PORT || 3000;
const client = new Discord.Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});


app.get("/", (req, res) => {
    res.send("Hello Discord!!")
});

client.on("messageCreate", message => {
    if(message.content === "ping"){
        message.channel.send("pong!")
    }
});

client.login(process.env.TOKEN)
    .then(() => console.log("entering the discord world"))
    .catch((err) => console.error("error logging in: ", err))

app.listen(port || 3000, () => {
    console.log(`Stupid violet reporting to service on port: ${port}`)
});