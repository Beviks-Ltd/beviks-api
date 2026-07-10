import { Router, Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../db.js";

export const authRouter = Router();

const JWT_SECRET = process.env.JWT_SECRET || "supersecretjwtkeyforbeviksapi";

// Helper to generate access tokens
function generateToken(user: { id: string; email: string; role: string; isEmailVerified: boolean }) {
  return jwt.sign(
    { userId: user.id, email: user.email, role: user.role, isEmailVerified: user.isEmailVerified },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

// Helper to generate verification token
function generateVerificationToken(email: string) {
  return jwt.sign({ email }, JWT_SECRET, { expiresIn: "1d" });
}

/**
 * @openapi
 * components:
 *   schemas:
 *     UserRole:
 *       type: string
 *       enum: [CUSTOMER, DESIGNER]
 *     Gender:
 *       type: string
 *       enum: [MALE, FEMALE, OTHER]
 *     UserResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         email:
 *           type: string
 *         fullName:
 *           type: string
 *         phoneNumber:
 *           type: string
 *           nullable: true
 *         gender:
 *           type: string
 *           nullable: true
 *         dateOfBirth:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         role:
 *           $ref: '#/components/schemas/UserRole'
 *         isEmailVerified:
 *           type: boolean
 *         socialProvider:
 *           type: string
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 */

/**
 * @openapi
 * /api/auth/register/traditional:
 *   post:
 *     summary: Stage 1 Traditional Registration (Email & Password)
 *     description: Creates a user account with basic details, triggers a verification email, and returns initial status.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - password
 *               - role
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: John Doe
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: securePassword123
 *               role:
 *                 $ref: '#/components/schemas/UserRole'
 *     responses:
 *       201:
 *         description: Account successfully initialized. Verification email sent.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/UserResponse'
 *                 token:
 *                   type: string
 *                   description: JWT access token for authentication
 *                 verificationLink:
 *                   type: string
 *                   description: Simulated email verification link sent to user
 *       400:
 *         description: Email already in use or invalid payload.
 */
authRouter.post("/register/traditional", async (req: Request, res: Response): Promise<any> => {
  try {
    const { fullName, email, password, role } = req.body;

    if (!fullName || !email || !password || !role) {
      return res.status(400).json({ error: "Missing required fields: fullName, email, password, role" });
    }

    if (role !== "CUSTOMER" && role !== "DESIGNER") {
      return res.status(400).json({ error: "Invalid role. Must be CUSTOMER or DESIGNER." });
    }

    // Check if email already exists
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      return res.status(400).json({ error: "Email already registered" });
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await prisma.user.create({
      data: {
        fullName,
        email,
        passwordHash,
        role: role as any,
        isEmailVerified: false
      }
    });

    const token = generateToken(user);
    const verificationToken = generateVerificationToken(user.email);
    const verificationLink = `http://localhost:3000/api/auth/verify-email?token=${verificationToken}`;

    // Here we would normally call a mail service. We'll log it and return it in the response for simulation.
    console.log(`[Email Sent] Verification link for ${user.email}: ${verificationLink}`);

    return res.status(201).json({
      message: "Stage 1 Registration successful. Please verify your email.",
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        createdAt: user.createdAt
      },
      token,
      verificationLink
    });
  } catch (error: any) {
    console.error("Traditional register error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/auth/register/complete-profile:
 *   post:
 *     summary: Stage 2 Profile Completion
 *     description: Completes profile details (phone, gender, DOB) for traditional registration.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - phoneNumber
 *               - gender
 *               - dateOfBirth
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 example: e634127c-9b76-47ee-8cd6-c67ee59d9972
 *               phoneNumber:
 *                 type: string
 *                 example: "+1234567890"
 *               gender:
 *                 $ref: '#/components/schemas/Gender'
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: "1995-12-15"
 *     responses:
 *       200:
 *         description: Profile setup completed successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/UserResponse'
 *                 token:
 *                   type: string
 *                   description: Updated JWT access token
 *                 requiresIdentity:
 *                   type: boolean
 *                   description: True if role is DESIGNER and they must submit ID documents.
 *       400:
 *         description: User not found or invalid inputs.
 */
authRouter.post("/register/complete-profile", async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, phoneNumber, gender, dateOfBirth } = req.body;

    if (!userId || !phoneNumber || !gender || !dateOfBirth) {
      return res.status(400).json({ error: "Missing required fields: userId, phoneNumber, gender, dateOfBirth" });
    }

    if (gender !== "MALE" && gender !== "FEMALE" && gender !== "OTHER") {
      return res.status(400).json({ error: "Invalid gender. Must be MALE, FEMALE, or OTHER." });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: {
        phoneNumber,
        gender: gender as any,
        dateOfBirth: new Date(dateOfBirth)
      }
    });

    const token = generateToken(updatedUser);
    const requiresIdentity = updatedUser.role === "DESIGNER";

    return res.status(200).json({
      message: "Profile setup completed successfully.",
      user: {
        id: updatedUser.id,
        email: updatedUser.email,
        fullName: updatedUser.fullName,
        phoneNumber: updatedUser.phoneNumber,
        gender: updatedUser.gender,
        dateOfBirth: updatedUser.dateOfBirth,
        role: updatedUser.role,
        isEmailVerified: updatedUser.isEmailVerified,
        createdAt: updatedUser.createdAt
      },
      token,
      requiresIdentity
    });
  } catch (error: any) {
    console.error("Complete profile error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/auth/register/social:
 *   post:
 *     summary: Social Media Registration (Apple / Google)
 *     description: Creates/Registers a user directly from social credentials. Email is verified automatically.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - fullName
 *               - email
 *               - socialProvider
 *               - socialId
 *               - role
 *               - phoneNumber
 *               - gender
 *               - dateOfBirth
 *             properties:
 *               fullName:
 *                 type: string
 *                 example: Jane Google
 *               email:
 *                 type: string
 *                 format: email
 *                 example: jane.google@example.com
 *               socialProvider:
 *                 type: string
 *                 enum: [GOOGLE, APPLE]
 *                 example: GOOGLE
 *               socialId:
 *                 type: string
 *                 example: "109283749201"
 *               role:
 *                 $ref: '#/components/schemas/UserRole'
 *               phoneNumber:
 *                 type: string
 *                 example: "+1098765432"
 *               gender:
 *                 $ref: '#/components/schemas/Gender'
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: "1992-05-20"
 *     responses:
 *       201:
 *         description: Social registration successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/UserResponse'
 *                 token:
 *                   type: string
 *                 requiresIdentity:
 *                   type: boolean
 */
authRouter.post("/register/social", async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      fullName,
      email,
      socialProvider,
      socialId,
      role,
      phoneNumber,
      gender,
      dateOfBirth
    } = req.body;

    if (!fullName || !email || !socialProvider || !socialId || !role || !phoneNumber || !gender || !dateOfBirth) {
      return res.status(400).json({ error: "Missing required registration parameters." });
    }

    if (socialProvider !== "GOOGLE" && socialProvider !== "APPLE") {
      return res.status(400).json({ error: "Invalid social provider. Must be GOOGLE or APPLE." });
    }

    if (role !== "CUSTOMER" && role !== "DESIGNER") {
      return res.status(400).json({ error: "Invalid role. Must be CUSTOMER or DESIGNER." });
    }

    // Check if email already exists
    let user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      // If user exists and has social id, log them in. If not, link provider or return error.
      if (user.socialId === socialId) {
        const token = generateToken(user);
        return res.status(200).json({
          message: "Social login successful (user already registered).",
          user,
          token,
          requiresIdentity: user.role === "DESIGNER" && !(await prisma.designerProfile.findUnique({ where: { userId: user.id } }))
        });
      }
      return res.status(400).json({ error: "Email already registered via traditional login or different account." });
    }

    // Create new user (social users have email auto-verified)
    user = await prisma.user.create({
      data: {
        fullName,
        email,
        socialProvider,
        socialId,
        role: role as any,
        phoneNumber,
        gender: gender as any,
        dateOfBirth: new Date(dateOfBirth),
        isEmailVerified: true // Auto verified via Google/Apple
      }
    });

    const token = generateToken(user);
    const requiresIdentity = user.role === "DESIGNER";

    return res.status(201).json({
      message: "Social registration completed.",
      user,
      token,
      requiresIdentity
    });
  } catch (error: any) {
    console.error("Social registration error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/auth/register/designer/identity:
 *   post:
 *     summary: Designer Identity Document Upload (Designer only)
 *     description: Submits identity verification documents for manual admin checks.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - identityType
 *               - identityFrontUrl
 *               - identityBackUrl
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 example: e634127c-9b76-47ee-8cd6-c67ee59d9972
 *               identityType:
 *                 type: string
 *                 example: "PASSPORT"
 *               identityFrontUrl:
 *                 type: string
 *                 example: "https://cloudflare-r2.com/beviks-api/identity-front.jpg"
 *               identityBackUrl:
 *                 type: string
 *                 example: "https://cloudflare-r2.com/beviks-api/identity-back.jpg"
 *     responses:
 *       200:
 *         description: Identity documents submitted.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 profile:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     userId:
 *                       type: string
 *                     identityType:
 *                       type: string
 *                     identityFrontUrl:
 *                       type: string
 *                     identityBackUrl:
 *                       type: string
 *                     isIdentityVerified:
 *                       type: boolean
 */
authRouter.post("/register/designer/identity", async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, identityType, identityFrontUrl, identityBackUrl } = req.body;

    if (!userId || !identityType || !identityFrontUrl || !identityBackUrl) {
      return res.status(400).json({ error: "Missing identity profile variables." });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.role !== "DESIGNER") {
      return res.status(400).json({ error: "Only Designers require identity documentation." });
    }

    const profile = await prisma.designerProfile.upsert({
      where: { userId },
      update: {
        identityType,
        identityFrontUrl,
        identityBackUrl
      },
      create: {
        userId,
        identityType,
        identityFrontUrl,
        identityBackUrl
      }
    });

    return res.status(200).json({
      message: "Identity documentation submitted successfully.",
      profile
    });
  } catch (error: any) {
    console.error("Identity submit error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/auth/verify-email:
 *   get:
 *     summary: Verify User Email
 *     description: Validates email verification tokens triggered by registration emails.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The verification token sent in the email.
 *     responses:
 *       200:
 *         description: Email verified successfully.
 *       400:
 *         description: Invalid or expired token.
 */
authRouter.get("/verify-email", async (req: Request, res: Response): Promise<any> => {
  try {
    const { token } = req.query;

    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "Missing token parameter." });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { email: string };
    if (!decoded || !decoded.email) {
      return res.status(400).json({ error: "Invalid token structure." });
    }

    const user = await prisma.user.findUnique({ where: { email: decoded.email } });
    if (!user) {
      return res.status(404).json({ error: "User not found associated with token." });
    }

    await prisma.user.update({
      where: { email: decoded.email },
      data: { isEmailVerified: true }
    });

    // Provide a simple HTML page or JSON response
    return res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h2 style="color: #2e7d32;">Email Verified Successfully!</h2>
          <p>You can now return to the application.</p>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Email verification error:", error);
    return res.status(400).send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h2 style="color: #c62828;">Verification Failed</h2>
          <p>The verification link is invalid or has expired.</p>
        </body>
      </html>
    `);
  }
});

/**
 * @openapi
 * /api/auth/upload-url:
 *   get:
 *     summary: Generate Cloudflare Upload URL
 *     description: Requests a mock Cloudflare R2 presigned URL to securely upload files directly from client side.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *         example: storefront-logo.png
 *       - in: query
 *         name: contentType
 *         required: true
 *         schema:
 *           type: string
 *         example: image/png
 *     responses:
 *       200:
 *         description: Upload details generated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uploadUrl:
 *                   type: string
 *                   description: Presigned URL destination (mocked)
 *                 publicUrl:
 *                   type: string
 *                   description: Target public URL destination once uploaded
 */
authRouter.get("/upload-url", (req: Request, res: Response): any => {
  const { fileName, contentType } = req.query;

  if (!fileName || !contentType) {
    return res.status(400).json({ error: "fileName and contentType query parameters required." });
  }

  const uniqueName = `${Date.now()}-${fileName}`;
  const mockUploadUrl = `https://cloudflare-r2.com/beviks-api-uploads/${uniqueName}?sig=mocksignature`;
  const publicUrl = `https://cdn.beviks-api.com/uploads/${uniqueName}`;

  return res.status(200).json({
    uploadUrl: mockUploadUrl,
    publicUrl: publicUrl
  });
});
