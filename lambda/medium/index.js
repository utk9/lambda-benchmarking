const nodemailer = require('nodemailer');

const { user, pass } = require('./config/auth').gmail;

exports.handler = (event, context, callback) => {

	const transporter = nodemailer.createTransport({
		service: 'gmail',
		auth: {
			user,
			pass,
		}
	});

	// const  { to } = event;

	const mailOptions = {
		from: 'dprevrev@gmail.com',
		to: 'dprevrev@gmail.com',
		subject: 'Test email, sent using AWS lambda and queued using SQS, let the disruption begin',
		text: 'Hello World',
		html: '<h3>Greetings, good sir/ma\'am.</h3>',
	}

	transporter.sendMail(mailOptions, (err, info) => {
		if (err) {
			callback(err);
		} else {
			callback(null, info);
		}
	});
}
