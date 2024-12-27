import express from "express";
import Discord, { EmbedBuilder, GatewayIntentBits } from "discord.js";
import "dotenv/config";
import mongoose from "mongoose";
import User from "./models/User.js";
import PendingRequest from "./models/PendingRequest.js";
import Task from "./models/Task.js";

const app = express();
const port = process.env.PORT || 3000;
const client = new Discord.Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ],
});

// MongoDB setup
mongoose
    .connect(process.env.MONGO_URI, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
    })
    .then(() => console.log("Connected to MongoDB"))
    .catch(err => console.log("MongoDB connection error:", err));

// Home page
app.get("/", (req, res) => {
    res.send("Hello Discord!!");
});

// Helper to display scoreboard
async function displayScoreboard() {
    const users = await User.find().sort({ createdAt: -1 }); // Sort by score descending
    if (!users.length) return "No scores available yet.";

    let scoreboard = "+=======================================+\n";
    scoreboard += "|               SCOREBOARD              |\n";
    scoreboard += "+====================+==================+\n";

    for (let i = 0; i < users.length; i += 2) {
        const user1 = users[i] || {}; // Use an empty object if undefined
        const user2 = users[i + 1] || {}; // Use an empty object if undefined

        const username1 = user1.nickname || ""; // Fallback to empty string if no username
        const username2 = user2.nickname || ""; // Fallback to empty string if no username
        const score1 = user1.score !== undefined ? user1.score.toString() : ""; // Fallback to empty string if no score
        const score2 = user2.score !== undefined ? user2.score.toString() : ""; // Fallback to empty string if no score

        // Create the first row for usernames
        scoreboard += "| " +
            username1.padEnd(17) + " | " +
            username2.padEnd(17) + " |\n";

        // Create the second row for scores
        scoreboard += "| " +
            score1.padEnd(17) + " | " +
            score2.padEnd(17) + " |\n";

        scoreboard += "+====================+==================+\n";
    }

    return "```\n" + scoreboard + "\n```";
}


// Unified messageCreate handler
client.on("messageCreate", async (message) => {
    if (message.author.bot) return; // Ignore bot messages

    // Ping command
    if (message.content.toLowerCase() === "ping") {
        return message.channel.send("pong!");
    }

    // View scoreboard
    if (message.content === "/scoreboard") {
        try {
            const scoreboard = await displayScoreboard();
            message.channel.send(scoreboard);
        } catch (err) {
            console.error(err);
            message.channel.send("An error occurred while fetching the scoreboard.");
        }
    }

    // List tasks
    if (message.content === "/tasks") {
        let taskList = "Available Tasks:\n";
        let tasks = await Task.find({status: "approved"});
        tasks.forEach((task) => {
            taskList += `${task.taskId}. ${task.description} - ${task.points} points\n`;
        });
        return message.channel.send("```\n" + taskList + "\n```");
    }

    // add a new task
    if (message.content.startsWith("/createtask")) {
        const args = message.content.split(" ").slice(1); // Remove the command
        const taskName = args.slice(0, -1).join(" "); // All args except last
        const points = parseFloat(args[args.length - 1]); // Last argument as points

        if (!taskName || isNaN(points)) {
            return message.channel.send("Usage: `/createtask <task name> <points>`");
        }

        const requester = await User.findOne({discordId: message.author.id});

        try {
            // Create a pending task addition request
            const request = new PendingRequest({
                id: message.id,
                type: "task_add",
                requesterId: message.author.id,
                requesterUsername: message.author.username,
                requesterNickname: requester.nickname,
                approverId: null, // Set approver later when processing
                approverUsername: null, // Set approver later when processing
                approverNickname: null,
                points,
                description: taskName,
                status: "pending",
            });

            await request.save();

            message.reply(
                `Task addition request created for "${taskName}" with ${points} points. ` +
                "(⊙_⊙)？Please reply to this message with `yes` or `no` to approve."
            );
        } catch (err) {
            console.error(err);
            message.channel.send("An error occurred while creating the request.");
        }
    }

    // Add points with approval
    if (message.content.startsWith("/add")) {
        const args = message.content.split(" ");
        const points = parseFloat(args[2]);
        const userMention = message.mentions.users.first(); // Get the user to whom points are being added

        if (!points || !userMention) {
            return message.channel.send("Usage: `/add <@user> <points>`");
        };

        const requester = await User.findOne({discordId: message.author.id});
        const mentionedUserEntry = await User.findOne({discordId: userMention.id});

        // Create a pending request for approval
        try {
            const pendingRequest = new PendingRequest({
                id: message.id, // message ID
                type: "points_add",
                description: `add ${points} points to ${userMention.nickname}`,
                requesterId: message.author.id, // User who is requesting points
                requesterUsername: message.author.username,
                requesterNickname: requester.nickname,
                approverId: null,  // set approver later while processing
                approverUsername: null,
                approverNickname: null,
                points,
                status: "pending",
                createdAt: new Date(),
            });

            await pendingRequest.save();

            // Notify the approver of the pending request
            const requestMessage = await message.reply(
                `${requester.nickname} has requested ${points} points to be added to ${mentionedUserEntry.nickname}'s score. ` +
                "Please reply to this message with `yes` or `no` to approve."
            );

            // requestMessage.react("✅");
            // requestMessage.react("❌");
        } catch (err) {
            console.error(err);
            message.channel.send("An error occurred while saving the request.");
        }
    }

    // edit a task
    if (message.content.startsWith("/edittask")) {
        const args = message.content.split(" ").slice(1); // Remove the command
        const taskId = args[0]; // Task ID
        const newTaskName = args.slice(1, -1).join(" "); // All args except first and last
        const newPoints = parseFloat(args[args.length - 1]); // Last argument as points

        if (!taskId || !newTaskName || isNaN(newPoints)) {
            return message.channel.send("Usage: `/edittask <task ID> <new task description> <new points>`");
        }

        try {
            // Find the task to edit
            const task = await Task.findOne({taskId});

            if (!task) {
                return message.channel.send("Task not found.");
            };

            const requester = await User.findOne({discordId: message.author.id});

            // Create a pending task edit request
            const request = new PendingRequest({
                id: message.id,
                type: "task_edit",
                requesterId: message.author.id,
                requesterUsername: message.author.username,
                requesterNickname: requester.nickname,
                approverId: null,
                approverUsername: null,
                approverNickname: null,
                description: newTaskName,
                points: newPoints,
                status: "pending",
                taskId
            });

            await request.save();

            message.reply(
                `Task edit request created for task "${task.description}".` +
                "Please reply to this message with `yes` or `no` to approve"
            );
        } catch (err) {
            console.error(err);
            message.channel.send("An error occurred while creating the request.");
        }
    }

    // do task -- command a fool
    if (message.content.startsWith("/do")) {
        const args = message.content.split(" ");
        const userMention = message.mentions.users.first();
        const points = parseFloat(args[2]);
        const taskId = args.slice(-1).join(" ");

        if(!userMention || !points || !taskId){
            // console.log(userMention, points, taskId);
            return message.channel.send("Usage: `/do <@user> <points> <taskId>`")
        }

        try{
            const requester = await User.findOne({discordId: message.author.id});
            const mentionedUserEntry = await User.findOne({discordId: userMention.id});
            if(!requester || requester.score < points){
                return message.channel.send("You don't have enough points!");
            }

            const task = await Task.findOne({taskId});

            if(!task){
                return message.channel.send("Task not found -_-");
            }
            console.log("task: ", task, "task id", task.id);

            const request = new PendingRequest({
                id: message.id,
                type: "task_do",
                requesterId: message.author.id,
                requesterUsername: message.author.username,
                requesterNickname: requester.nickname,
                approverId: userMention.id, // Set approver later when processing
                approverUsername: userMention.username, // Set approver later when processing
                approverNickname: mentionedUserEntry.nickname,
                points,
                description: task.description,
                status: "pending",
                taskId
            });

            await request.save();

            message.reply(
                `${mentionedUserEntry.nickname} has been requested to: ${task.description}.\n` + 
                `${mentionedUserEntry.nickname} 〜(￣▽￣〜) needs to approve this request.`
            );
        } catch (err) {
            console.error(err);
            message.channel.send("An error occured while processing the task")
        }
    }

    if (message.content === "/pending") {
        try{
            const pendingRequests = await PendingRequest.find({status: "pending"});
            const pendingTasks = await Task.find({status: "pending"});
            const ongoingTasks = await PendingRequest.find({status: "ongoing"});
            const unreviewedTasks = await PendingRequest.find({status: "review"});

            let list = "Unapproved requests:\n";
            const embeds = [];
            pendingRequests.forEach((request, index) => {
                console.log(request);
                const embed = new EmbedBuilder()
                    .setTitle(`${index + 1}. ${request.description} for ${request.points}`)
                    .setURL(`https://discord.com/channels/${message.guildId}/${message.channelId}/${request.id}`)
                    .setDescription("Unapproved Request")
                list += `${index + 1}. ${request.description}\n`;
                embeds.push(embed);
            })

            list += "\nUnapproved tasks:\n";

            pendingTasks.forEach((task, index) => {
                const embed = new EmbedBuilder()
                    .setTitle(`${index + 1}. ${task.description} for ${task.points}potnts`)
                    .setURL(`https://discord.com/channels/${message.guildId}/${message.channelId}/${task.id}`)
                    .setDescription("Unapproved task")
                list += `${index + 1}. ${task.description}\n`;
                embeds.push(embed);
            })

            list += "\nOngoing tasks:\n";
            ongoingTasks.forEach((task, index) => {
                const embed = new EmbedBuilder()
                    .setTitle(`${index + 1}. ${task.description} for ${task.points}points`)
                    .setURL(`https://discord.com/channels/${message.guildId}/${message.channelId}/${task.id}`)
                    .setDescription("Ongoing task")
                list += `${index + 1}. ${task.description}\n`;
                embeds.push(embed);
            })

            list += "\nUnreviewed tasks:\n";
            unreviewedTasks.forEach((task, index) => {
                const embed = new EmbedBuilder()
                    .setTitle(`${index + 1}. ${task.description} for ${task.points}points`)
                    .setURL(`https://discord.com/channels/${message.guildId}/${message.channelId}/${task.id}`)
                    .setDescription("Unreviewed task")
                list += `${index + 1}. ${task.description}\n`;
                embeds.push(embed);
            })

            for (const embed of embeds) {
                await message.channel.send({ embeds: [embed] });
            }

            return message.channel.send("```\n" + list + "\n```");
        } catch (error) {
            console.error(error);
            message.channel.send("Error fetching pending lists and tasks")
        }
    }

    // Handle yes/no by replying to the request/task
    if (message.content.toLowerCase() === "yes" || message.content.toLowerCase() === "no") {
        const messageReply = message.reference ? await message.channel.messages.fetch(message.reference.messageId) : null;

        if (!messageReply) return;
        try {
            let originalMessage = await message.channel.messages.fetch(messageReply.reference.messageId)
            // Find the pending request based on the approver and status
            let request = await PendingRequest.findOne({
                status: "pending",
                id: originalMessage.id,
            });
            if (!request) {
                originalMessage = await message.channel.messages.fetch(originalMessage.reference.messageId);
                request = await PendingRequest.findOne({
                    status: "review",
                    id: originalMessage.id,
                });
            }
            // console.log("found: ", messageReply.id, request, originalMessage.id);

            if(!request){
                return message.channel.send("Request not found or already processed.");
            }
                
            const messageAuthor = await User.findOne({discordId: message.author.id});
            // Ensure the approver is not the requester
            if (request.requesterId === message.author.id && request.type !== "task_do") {
                // You cannot approve your own request.
                return message.channel.send("...(*￣０￣)ノ You are not worthy");
            } else if (message.content.toLowerCase() === "yes") {
                if (request.type === "points_add") {
                    await User.findOneAndUpdate(
                        { discordId: request.requesterId },
                        { $inc: { score: request.points } },
                        { new: true, upsert: true }
                    );

                    message.channel.send(
                        `I, ${messageAuthor.nickname} approves your request.. ${request.requesterNickname} `
                    );

                    // display the scoreboard
                    const scoreboard = await displayScoreboard();
                    message.channel.send(scoreboard);
                } else if (request.type === "task_add") {
                    const newTask = new Task({
                        id: request.id,
                        description: request.description,
                        requesterId: request.requesterId,
                        requesterUsername: request.requesterUsername,
                        requesterNickname: request.requesterNickname,
                        approverId: message.author.id,
                        approverUsername: message.author.username,
                        approverNickname: messageAuthor.nickname,
                        status: "approved",
                        points: request.points,
                    });

                    await newTask.save();
                    message.channel.send("Task approved and added");
                } else if (request.type === "task_edit"){
                    await Task.updateOne(
                        { taskId: request.taskId },
                        {
                            points: request.points,
                            description: request.description,
                        }
                    );

                    message.channel.send("Task edited successfully!");
                } else if (request.type === "task_do") { 
                    if(request.status === "review"){
                        if( message.author.id === request.approverId ){
                            return message.channel.send("You are not worthy XD");
                        }
                        request.status = "completed";
                        await request.save();

                        await User.findOneAndUpdate(
                            { discordId: request.approverId },
                            { $inc: {score: request.points/2} }
                        );

                        message.channel.send(`${request.approverNickname} has comepleted the task: ${request.description}`);
                        await displayScoreboard();
                        return;
                    }
                    else if( message.author.id !== request.approverId ){
                        return message.channel.send("You are not worthy XD");
                    } else {
                        request.status = "ongoing";
                        await request.save();
                        await User.findOneAndUpdate(
                            { discordId: request.requesterId },
                            { $inc: {score: -request.points} }
                        );

                        message.channel.send(`${messageAuthor.nickname} is going to ${request.description}`);
                        await displayScoreboard();
                        return;
                    }
                }

                if(request.type !== "task_do"){
                    request.status = "approved";
                    await request.save();
                }

            } else if (message.content.toLowerCase() === "no") {
                // Reject the request
                request.status = "rejected";
                await request.save();

                message.channel.send(`${messageAuthor.nickname} has rejected the request  ` + "`(╯‵□′)╯︵┻━┻`" + `  from ${request.requesterNickname}.`);
            }
        } catch (err) {
            console.error(err);
            message.channel.send("An error occurred while processing the request.");
        }
    }

    // setup username and nickname
    if (message.content.startsWith("/begin")) {
        const args = message.content.split(" ");
        const mentionUser = message.mentions.users.first();
        let nickname = args.slice(2).join(" ");

        console.log(mentionUser);
        if(!nickname || !mentionUser){
            return message.channel.send("```Usage: /begin <@user> <nickname>```");
        }
        await User.findOneAndUpdate(
            { discordId: mentionUser.id },
            {   
                discordId: mentionUser.id,
                username: mentionUser.username, 
                nickname,
            },
            { upsert: true, new: true }
        )

        message.channel.send("Profile succesfully updated!");
    }

    if (message.content.startsWith("/taskcompleted")) {
        const replyMessage = message.reference ? await message.channel.messages.fetch(message.reference?.messageId) : null;
        if(!replyMessage){
            return message.channel.send("Mention the task message with\n```/taskcompleted```")
        }
        const task = await PendingRequest.findOne({
            status: "ongoing",
            id: replyMessage.id,
        })
        if(!task){
            console.log(task, replyMessage.id);
            return message.channel.send("Task not found or already completed");
        }

        task.status = "review";
        await task.save();

        message.reply(`Task completed🎉❓ \nwait for approval from a user`);
    }

    if (message.content === "/help") {
        let commandList = [
            {
                name: "Add points to a user",
                command: "/add <@user> <points>",
                // description: "Message reference not needed",
            },
            {
                name: "View Scoreboard",
                command: "/scoreboard",
                // description: "Message reference not needed",
            },
            {
                name: "View Tasks",
                command: "/tasks",
                // description: "Message reference not needed",
            },
            {
                name: "Create a new task",
                command: "/createtask",
                // description: "Message reference not needed",
            },
            {
                name: "Edit a task",
                command: "/edittask <task ID> <new task description> <new points>",
                // description: "Message reference not needed",
            },
            {
                name: "Want someone to do a task ❓",
                command: "/do <@user> <points> <taskId>",
                // description: "Message reference not needed",
            },
            {
                name: "View pending tasks and requests",
                command: "/pending",
                // description: "Message reference not needed",
            },
            {
                name: "Create profile or Change nickname",
                command: "/begin <@user> <nickname>",
                description: "You can also change the nickname of other users (～￣▽￣)～",
            },
            {
                name: "Completed a task❓",
                command: "/taskcompleted",
                description: "⚠Reply to the TASK message",
            },
            {
                name: "Approve request or task",
                command: "`yes`",
                description: "⚠Reply to the bot approval message",
            },
            {
                name: "Reject a request or task",
                command: "`no`",
                description: "⚠Reply to the bot approval message",
            },
        ]

        let text = "```Here is the commands list: \n";
        commandList.forEach((command, index) => {
            text += `\n${index+1}. ${command.name}\n   Use: ${command.command}\n   ${command.description ? command.description : ""}\n\n`
        });
        text += "\n```"

        message.channel.send(text);
    }

    if (message.content === "stfu") {
        message.channel.send("Nahi 🙂");
    }
});


// Bot login
client.login(process.env.TOKEN)
    .then(() => console.log("Entering the Discord world"))
    .catch((err) => console.error("Error logging in:", err));

app.listen(port || 3000, () => {
    console.log(`Stupid Violet reporting to service on port: ${port}`);
});
