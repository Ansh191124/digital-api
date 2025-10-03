import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  name: {
    type: String,
    required: true
  },
  assignedPhoneNumber: {
    type: String,
    // Note: The previous definition had this as 'required: true' and 'unique: true'.
    // If you plan for users without a phone number, remove `required: true`.
    // Keeping your original schema definition here:
    required: true,
    unique: true 
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});


const User = mongoose.model('User', userSchema);

// ✅ Named Export for ES Module compatibility with 'import { User }'
export { User };