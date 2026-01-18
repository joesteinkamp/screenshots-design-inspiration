const functions = require("firebase-functions");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");

admin.initializeApp();

exports.sendEmailNotification = functions
    .runWith({ 
        secrets: ["GMAIL_PASSWORD"],
        // Ensure we use a supported Node version if needed, but engine field handles it.
    })
    .storage.object()
    .onFinalize(async (object) => {
        const filePath = object.name;
        const contentType = object.contentType; // e.g. image/png
        
        // Get the project ID to construct the console URL
        const projectId = process.env.GCLOUD_PROJECT || "screenshots-917c8"; 

        // In 1st Gen functions, secrets are available in process.env
        const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: process.env.EMAIL_USER || "joe.steinkamp@gmail.com", 
                pass: process.env.GMAIL_PASSWORD // Access secret from env
            }
        });
        
        const mailOptions = {
            from: `Screenshot Uploader <${process.env.EMAIL_USER || "noreply@screenshots-design-inspiration.firebaseapp.com"}>`,
            to: "jsteinka@gmail.com", 
            subject: `New Upload: ${filePath.split('/').pop()}`,
            html: `
                <h2>New File Uploaded</h2>
                <p><strong>File:</strong> ${filePath}</p>
                <p>
                    <a href="https://console.firebase.google.com/project/${projectId}/storage/files">
                        View in Firebase Console
                    </a>
                </p>
            `
        };

        try {
            await transporter.sendMail(mailOptions);
            functions.logger.log("Email notification sent for:", filePath);
        } catch (error) {
            functions.logger.error("Error sending email:", error);
        }
    });
