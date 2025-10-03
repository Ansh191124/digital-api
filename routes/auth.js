// auth.js - Final Authentication Router and Middleware

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
// Assuming your User model is correctly set up as a NAMED export
import { User } from '../models/User.js'; // 🎯 Adjust path if your User model is elsewhere

const router = express.Router();

// ------------------------------------
// --- 1. AUTHENTICATION MIDDLEWARE ---
// ------------------------------------

/**
 * Middleware to verify a JWT from the Authorization header (Bearer token).
 * Attaches the decoded user payload to req.user if valid.
 */
// 🎯 This is a NAMED export, imported by api.js
export const authenticateToken = (req, res, next) => {
  // Get the token from the Authorization header
  const authHeader = req.headers['authorization'];
  // Extract token: 'Bearer TOKEN' -> TOKEN
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    // 401 Unauthorized: client failed to authenticate
    return res.status(401).json({ error: 'Access denied - No token provided' });
  }

  try {
    // Verify and decode the token using the secret key
    const verified = jwt.verify(token, process.env.JWT_SECRET);
    // Attach the payload (userId, email, role, etc.) to the request
    req.user = verified;
    // Token is valid, proceed
    next();
  } catch (error) {
    // 403 Forbidden: client is authenticated but does not have access (e.g., token expired)
    res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// ------------------------------------
// --- 2. PUBLIC ROUTES ---
// ------------------------------------

// USER REGISTRATION
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, assignedPhoneNumber, role } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Name, email, and password are required' });
    }

    // Check for existing user
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'User with this email already exists' });
    }

    // Hash the password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create new user instance
    const newUser = new User({
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
      assignedPhoneNumber: assignedPhoneNumber || null, 
      role: role || 'user'
    });

    const savedUser = await newUser.save();

    console.log(`New user registered: ${savedUser.email}`);
    res.status(201).json({ message: 'User registered successfully', userId: savedUser._id });

  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// USER LOGIN
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Create JWT Token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        phoneNumber: user.assignedPhoneNumber,
        role: user.role
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' } // Token expires in 24 hours
    );

    console.log(`User logged in: ${user.email}`);

    res.json({ 
      token,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        phoneNumber: user.assignedPhoneNumber,
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

// ------------------------------------
// --- 3. PROTECTED ROUTES (using authenticateToken middleware) ---
// ------------------------------------

// VERIFY TOKEN
router.get('/verify', authenticateToken, async (req, res) => {
  try {
    // Look up user by ID from the verified token payload, excluding the password field
    const user = await User.findById(req.user.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({ valid: false, error: 'User not found' });
    }

    // Return success and the basic user data
    res.json({
      valid: true,
      user: {
        id: user._id,
        email: user.email,
        name: user.name,
        phoneNumber: user.assignedPhoneNumber,
        role: user.role
      }
    });
  } catch (error) {
    // This block handles DB errors, as token verification is handled by the middleware
    res.status(500).json({ valid: false, error: 'Verification failed' });
  }
});

// GET CURRENT USER
router.get('/me', authenticateToken, async (req, res) => {
  try {
    // req.user is set by authenticateToken
    const user = await User.findById(req.user.userId).select('-password');
    if (!user) {
        return res.status(404).json({ error: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    console.error('Fetch user error:', error);
    res.status(500).json({ error: 'Failed to fetch user info' });
  }
});

// ------------------------------------
// --- 4. FINAL EXPORT ---
// ------------------------------------

// 🎯 This is the DEFAULT export, imported by api.js and mounted under '/auth'
export default router; 
// The middleware is also exported for direct use in other routes within api.js
