import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import readline from 'readline';
import dotenv from 'dotenv';

dotenv.config();

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function ask(question) {
  return new Promise(resolve => rl.question(question, resolve));
}

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  name: String,
  assignedPhoneNumber: String,
  role: String,
  createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

async function createUser() {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/exotelDB');
    console.log('Connected to MongoDB\n');

    const email = await ask('Enter email: ');
    const password = await ask('Enter password: ');
    const name = await ask('Enter name: ');
    const phoneNumber = await ask('Enter assigned phone number (e.g., +91-80-46669001): ');
    const isAdmin = await ask('Is admin? (y/n): ');

    const existingEmail = await User.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      console.log('\nEmail already registered!');
      process.exit(1);
    }

    const existingPhone = await User.findOne({ assignedPhoneNumber: phoneNumber });
    if (existingPhone) {
      console.log('\nPhone number already assigned!');
      process.exit(1);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      name,
      assignedPhoneNumber: phoneNumber,
      role: isAdmin.toLowerCase() === 'y' ? 'admin' : 'user'
    });

    await user.save();

    console.log('\n========================================');
    console.log('USER CREATED SUCCESSFULLY');
    console.log('========================================');
    console.log(`Email: ${email}`);
    console.log(`Password: ${password}`);
    console.log(`Name: ${name}`);
    console.log(`Phone Number: ${phoneNumber}`);
    console.log(`Role: ${user.role}`);
    console.log('========================================\n');

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

createUser();