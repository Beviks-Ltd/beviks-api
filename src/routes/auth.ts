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
 *         address:
 *           type: string
 *           nullable: true
 *         bio:
 *           type: string
 *           nullable: true
 *         profileImageUrl:
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
      <!DOCTYPE html>
      <html>
        <head>
          <title>Email Verified - Beviks</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
          <style>
            * {
              box-sizing: border-box;
              font-family: 'Outfit', sans-serif;
            }
            body {
              background-color: #FFFFFF;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0;
              padding: 20px;
              color: #C4080E;
            }
            .card {
              background: #FFFFFF;
              border: 1px solid rgba(196, 8, 14, 0.15);
              padding: 40px;
              border-radius: 20px;
              width: 100%;
              max-width: 420px;
              box-shadow: 0 10px 30px rgba(196, 8, 14, 0.06);
              text-align: center;
            }
            h2 {
              margin: 0 0 10px 0;
              font-weight: 700;
              color: #C4080E;
            }
            p {
              color: #C4080E;
              opacity: 0.85;
              font-size: 15px;
              margin: 0;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Email Verified!</h2>
            <p>Your email has been verified. You can now return to the application.</p>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    console.error("Email verification error:", error);
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Verification Failed - Beviks</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
          <style>
            * {
              box-sizing: border-box;
              font-family: 'Outfit', sans-serif;
            }
            body {
              background-color: #FFFFFF;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0;
              padding: 20px;
              color: #C4080E;
            }
            .card {
              background: #FFFFFF;
              border: 1px solid rgba(196, 8, 14, 0.15);
              padding: 40px;
              border-radius: 20px;
              width: 100%;
              max-width: 420px;
              box-shadow: 0 10px 30px rgba(196, 8, 14, 0.06);
              text-align: center;
            }
            h2 {
              margin: 0 0 10px 0;
              font-weight: 700;
              color: #C4080E;
            }
            p {
              color: #C4080E;
              opacity: 0.85;
              font-size: 15px;
              margin: 0;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Verification Failed</h2>
            <p>The verification link is invalid or has expired.</p>
          </div>
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

/**
 * @openapi
 * /api/auth/login/traditional:
 *   post:
 *     summary: Traditional Credentials Login
 *     description: Authenticates user using email and password, returning an access token and user flags.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: securePassword123
 *     responses:
 *       200:
 *         description: Login successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/UserResponse'
 *                 token:
 *                   type: string
 *       400:
 *         description: Missing fields or invalid credentials.
 */
authRouter.post("/login/traditional", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Missing required fields: email, password" });
    }

    const user = await prisma.user.findUnique({
      where: { email },
      include: { designerProfile: true }
    });

    if (!user || !user.passwordHash) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      return res.status(400).json({ error: "Invalid email or password" });
    }

    const token = generateToken(user);

    return res.status(200).json({
      message: "Login successful",
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        isIdentityVerified: user.designerProfile?.isIdentityVerified || false,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error: any) {
    console.error("Traditional login error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/auth/login/social:
 *   post:
 *     summary: Social OAuth Login
 *     description: Logs in users via Apple or Google credentials.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - socialProvider
 *               - socialId
 *             properties:
 *               socialProvider:
 *                 type: string
 *                 enum: [GOOGLE, APPLE]
 *                 example: GOOGLE
 *               socialId:
 *                 type: string
 *                 example: "109283749201"
 *     responses:
 *       200:
 *         description: Social login successful.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   $ref: '#/components/schemas/UserResponse'
 *                 token:
 *                   type: string
 *       400:
 *         description: Missing fields or invalid credentials.
 */
authRouter.post("/login/social", async (req: Request, res: Response): Promise<any> => {
  try {
    const { socialProvider, socialId } = req.body;

    if (!socialProvider || !socialId) {
      return res.status(400).json({ error: "Missing required fields: socialProvider, socialId" });
    }

    if (socialProvider !== "GOOGLE" && socialProvider !== "APPLE") {
      return res.status(400).json({ error: "Invalid social provider. Must be GOOGLE or APPLE." });
    }

    const user = await prisma.user.findFirst({
      where: { socialProvider, socialId },
      include: { designerProfile: true }
    });

    if (!user) {
      return res.status(404).json({ error: "Social account not found. Please register first." });
    }

    const token = generateToken(user);

    return res.status(200).json({
      message: "Social login successful",
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        phoneNumber: user.phoneNumber,
        gender: user.gender,
        dateOfBirth: user.dateOfBirth,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
        isIdentityVerified: user.designerProfile?.isIdentityVerified || false,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error: any) {
    console.error("Social login error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/auth/forgot-password:
 *   post:
 *     summary: Request Password Reset
 *     description: Triggers a password reset token, simulating the emailing of a reset form link.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john.doe@example.com
 *     responses:
 *       200:
 *         description: Reset email trigger simulation completed.
 *       404:
 *         description: Email address not found.
 */
authRouter.post("/forgot-password", async (req: Request, res: Response): Promise<any> => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email parameter is required." });
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(404).json({ error: "No account exists with this email address." });
    }

    // Generate reset token (expires in 1 hour)
    const resetToken = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: "1h" });
    const resetLink = `http://localhost:3000/api/auth/reset-password?token=${resetToken}`;

    // Normally we send an email, we'll log it and return it in the response for simulation
    console.log(`[Email Sent] Password reset link for ${user.email}: ${resetLink}`);

    return res.status(200).json({
      message: "Password reset link generated and email sent (simulated).",
      resetLink
    });
  } catch (error: any) {
    console.error("Forgot password error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/auth/reset-password:
 *   get:
 *     summary: Render Password Reset Form
 *     description: Serves the HTML file for resetting password.
 *     tags:
 *       - Authentication
 *     parameters:
 *       - in: query
 *         name: token
 *         required: true
 *         schema:
 *           type: string
 *         description: The reset token.
 *     responses:
 *       200:
 *         description: Form HTML rendered.
 *       400:
 *         description: Invalid or expired token.
 */
authRouter.get("/reset-password", (req: Request, res: Response): any => {
  const { token } = req.query;

  if (!token || typeof token !== "string") {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Error - Beviks</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
          <style>
            * {
              box-sizing: border-box;
              font-family: 'Outfit', sans-serif;
            }
            body {
              background-color: #FFFFFF;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0;
              padding: 20px;
              color: #C4080E;
            }
            .card {
              background: #FFFFFF;
              border: 1px solid rgba(196, 8, 14, 0.15);
              padding: 40px;
              border-radius: 20px;
              width: 100%;
              max-width: 420px;
              box-shadow: 0 10px 30px rgba(196, 8, 14, 0.06);
              text-align: center;
            }
            h2 {
              margin: 0 0 10px 0;
              font-weight: 700;
              color: #C4080E;
            }
            p {
              color: #C4080E;
              opacity: 0.85;
              font-size: 15px;
              margin: 0;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Error</h2>
            <p>Reset token is missing.</p>
          </div>
        </body>
      </html>
    `);
  }

  try {
    // Verify token validity
    jwt.verify(token, JWT_SECRET);

    // Serve HTML form
    return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Reset Password - Beviks</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
          <style>
            * {
              box-sizing: border-box;
              font-family: 'Outfit', sans-serif;
            }
            body {
              background-color: #FFFFFF;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0;
              padding: 20px;
              color: #C4080E;
            }
            .card {
              background: #FFFFFF;
              border: 1px solid rgba(196, 8, 14, 0.15);
              padding: 40px;
              border-radius: 20px;
              width: 100%;
              max-width: 420px;
              box-shadow: 0 10px 30px rgba(196, 8, 14, 0.06);
            }
            h2 {
              margin: 0 0 10px 0;
              font-weight: 700;
              text-align: center;
              color: #C4080E;
            }
            p.desc {
              color: #C4080E;
              opacity: 0.85;
              font-size: 14px;
              text-align: center;
              margin: 0 0 25px 0;
            }
            .form-group {
              margin-bottom: 20px;
            }
            label {
              display: block;
              margin-bottom: 8px;
              font-size: 13px;
              font-weight: 600;
              color: #C4080E;
              text-transform: uppercase;
              letter-spacing: 0.05em;
            }
            input {
              width: 100%;
              padding: 12px 16px;
              border-radius: 8px;
              border: 1px solid rgba(196, 8, 14, 0.25);
              background: #FFFFFF;
              color: #C4080E;
              font-size: 15px;
              transition: all 0.2s ease;
            }
            input:focus {
              outline: none;
              border-color: #C4080E;
              box-shadow: 0 0 0 3px rgba(196, 8, 14, 0.2);
            }
            .btn {
              width: 100%;
              padding: 12px;
              background: #C4080E;
              border: none;
              border-radius: 8px;
              color: #FFFFFF;
              font-weight: 600;
              font-size: 15px;
              cursor: pointer;
              transition: transform 0.1s ease, filter 0.2s ease;
              box-shadow: 0 4px 12px rgba(196, 8, 14, 0.2);
            }
            .btn:hover {
              filter: brightness(1.1);
            }
            .btn:active {
              transform: scale(0.98);
            }
            .error-msg {
              color: #C4080E;
              font-size: 12px;
              margin-top: 5px;
              display: none;
              font-weight: bold;
            }
          </style>
          <script>
            function validateForm(e) {
              const p = document.getElementById("password").value;
              const cp = document.getElementById("confirm").value;
              const err = document.getElementById("err");
              
              if (p.length < 6) {
                e.preventDefault();
                err.innerText = "Password must be at least 6 characters long.";
                err.style.display = "block";
                return false;
              }
              if (p !== cp) {
                e.preventDefault();
                err.innerText = "Passwords do not match.";
                err.style.display = "block";
                return false;
              }
              return true;
            }
          </script>
        </head>
        <body>
          <div class="card">
            <h2>Reset Password</h2>
            <p class="desc">Enter a secure new password for your Beviks account.</p>
            <form action="/api/auth/reset-password" method="POST" onsubmit="return validateForm(event)">
              <input type="hidden" name="token" value="${token}" />
              <div class="form-group">
                <label for="password">New Password</label>
                <input type="password" id="password" name="password" required placeholder="••••••••" />
              </div>
              <div class="form-group">
                <label for="confirm">Confirm Password</label>
                <input type="password" id="confirm" required placeholder="••••••••" />
              </div>
              <div id="err" class="error-msg"></div>
              <button type="submit" class="btn">Update Password</button>
            </form>
          </div>
        </body>
      </html>
    `);
  } catch (error: any) {
    return res.status(400).send(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Link Expired - Beviks</title>
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <link rel="preconnect" href="https://fonts.googleapis.com">
          <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
          <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
          <style>
            * {
              box-sizing: border-box;
              font-family: 'Outfit', sans-serif;
            }
            body {
              background-color: #FFFFFF;
              min-height: 100vh;
              display: flex;
              align-items: center;
              justify-content: center;
              margin: 0;
              padding: 20px;
              color: #C4080E;
            }
            .card {
              background: #FFFFFF;
              border: 1px solid rgba(196, 8, 14, 0.15);
              padding: 40px;
              border-radius: 20px;
              width: 100%;
              max-width: 420px;
              box-shadow: 0 10px 30px rgba(196, 8, 14, 0.06);
              text-align: center;
            }
            h2 {
              margin: 0 0 10px 0;
              font-weight: 700;
              color: #C4080E;
            }
            p {
              color: #C4080E;
              opacity: 0.85;
              font-size: 15px;
              margin: 0;
            }
          </style>
        </head>
        <body>
          <div class="card">
            <h2>Link Expired</h2>
            <p>The password reset link is invalid or has expired. Please request a new link.</p>
          </div>
        </body>
      </html>
    `);
  }
});

/**
 * @openapi
 * /api/auth/reset-password:
 *   post:
 *     summary: Apply Password Reset
 *     description: Receives the token and new password, performs verification, hashes the password, and updates database.
 *     tags:
 *       - Authentication
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required:
 *               - token
 *               - password
 *             properties:
 *               token:
 *                 type: string
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password updated successfully.
 *       400:
 *         description: Verification failed.
 */
authRouter.post("/reset-password", async (req: Request, res: Response): Promise<any> => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      if (req.headers["content-type"]?.includes("form")) {
        return res.status(400).send(`
          <html>
            <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
              <h2 style="color: #c62828;">Error</h2>
              <p>Missing token or password parameters.</p>
            </body>
          </html>
        `);
      }
      return res.status(400).json({ error: "Missing token or password parameters." });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { email: string };
    if (!decoded || !decoded.email) {
      if (req.headers["content-type"]?.includes("form")) {
        return res.status(400).send(`
          <!DOCTYPE html>
          <html>
            <head>
              <title>Invalid Token - Beviks</title>
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <link rel="preconnect" href="https://fonts.googleapis.com">
              <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
              <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
              <style>
                * {
                  box-sizing: border-box;
                  font-family: 'Outfit', sans-serif;
                }
                body {
                  background-color: #FFFFFF;
                  min-height: 100vh;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  margin: 0;
                  padding: 20px;
                  color: #C4080E;
                }
                .card {
                  background: #FFFFFF;
                  border: 1px solid rgba(196, 8, 14, 0.15);
                  padding: 40px;
                  border-radius: 20px;
                  width: 100%;
                  max-width: 420px;
                  box-shadow: 0 10px 30px rgba(196, 8, 14, 0.06);
                  text-align: center;
                }
                h2 {
                  margin: 0 0 10px 0;
                  font-weight: 700;
                  color: #C4080E;
                }
                p {
                  color: #C4080E;
                  opacity: 0.85;
                  font-size: 15px;
                  margin: 0;
                }
              </style>
            </head>
            <body>
              <div class="card">
                <h2>Invalid Token</h2>
                <p>The password reset link is invalid or expired.</p>
              </div>
            </body>
          </html>
        `);
      }
      return res.status(400).json({ error: "Invalid token." });
    }

    const user = await prisma.user.findUnique({ where: { email: decoded.email } });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await prisma.user.update({
      where: { email: decoded.email },
      data: { passwordHash }
    });

    if (req.headers["content-type"]?.includes("form") || req.accepts("html")) {
      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Password Reset Successful - Beviks</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
              * {
                box-sizing: border-box;
                font-family: 'Outfit', sans-serif;
              }
              body {
                background-color: #FFFFFF;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
                padding: 20px;
                color: #C4080E;
              }
              .card {
                background: #FFFFFF;
                border: 1px solid rgba(196, 8, 14, 0.15);
                padding: 40px;
                border-radius: 20px;
                width: 100%;
                max-width: 420px;
                text-align: center;
                box-shadow: 0 10px 30px rgba(196, 8, 14, 0.06);
              }
              h2 {
                color: #C4080E;
                margin-top: 0;
                font-weight: 700;
              }
              p {
                color: #C4080E;
                opacity: 0.85;
                margin-bottom: 0;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Success!</h2>
              <p>Your password has been successfully updated. You may now return to the app and log in.</p>
            </div>
          </body>
        </html>
      `);
    }

    return res.status(200).json({ message: "Password updated successfully." });
  } catch (error: any) {
    console.error("Reset password apply error:", error);
    if (req.headers["content-type"]?.includes("form")) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Link Expired - Beviks</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <link rel="preconnect" href="https://fonts.googleapis.com">
            <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
            <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
            <style>
              * {
                box-sizing: border-box;
                font-family: 'Outfit', sans-serif;
              }
              body {
                background-color: #FFFFFF;
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                margin: 0;
                padding: 20px;
                color: #C4080E;
              }
              .card {
                background: #FFFFFF;
                border: 1px solid rgba(196, 8, 14, 0.15);
                padding: 40px;
                border-radius: 20px;
                width: 100%;
                max-width: 420px;
                box-shadow: 0 10px 30px rgba(196, 8, 14, 0.06);
                text-align: center;
              }
              h2 {
                margin: 0 0 10px 0;
                font-weight: 700;
                color: #C4080E;
              }
              p {
                color: #C4080E;
                opacity: 0.85;
                font-size: 15px;
                margin: 0;
              }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Link Expired</h2>
              <p>The password reset link is invalid or expired. Please request a new link.</p>
            </div>
          </body>
        </html>
      `);
    }
    return res.status(400).json({ error: "Invalid or expired token." });
  }
});

/**
 * @openapi
 * /api/auth/profile/edit:
 *   put:
 *     summary: Edit User Profile
 *     description: Modifies user account variables (fullName, email, phoneNumber, gender, dateOfBirth, address, bio, profileImageUrl) by matching the user's UUID.
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
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 example: e634127c-9b76-47ee-8cd6-c67ee59d9972
 *               fullName:
 *                 type: string
 *                 example: Segun Designs
 *               email:
 *                 type: string
 *                 format: email
 *                 example: segundesigns@gmail.com
 *               phoneNumber:
 *                 type: string
 *                 example: "+44 9-0163-1836"
 *               gender:
 *                 type: string
 *                 enum: [MALE, FEMALE, OTHER]
 *                 example: MALE
 *               dateOfBirth:
 *                 type: string
 *                 format: date
 *                 example: "1990-01-01"
 *               address:
 *                 type: string
 *                 example: "United Kingdom"
 *               bio:
 *                 type: string
 *                 example: "Bee Vogue"
 *               profileImageUrl:
 *                 type: string
 *                 example: "https://cloudinary.com/user123.png"
 *     responses:
 *       200:
 *         description: Profile updated successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 user:
 *                   $ref: '#/components/schemas/UserResponse'
 */
authRouter.put("/profile/edit", async (req: Request, res: Response): Promise<any> => {
  try {
    const { userId, fullName, email, phoneNumber, gender, dateOfBirth, address, bio, profileImageUrl } = req.body;

    if (!userId) {
      return res.status(400).json({ error: "userId parameter is required." });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User profile not found." });
    }

    const updateData: any = {};

    if (fullName !== undefined) {
      updateData.fullName = fullName;
    }

    if (email !== undefined) {
      const lowerEmail = email.toLowerCase().trim();
      if (lowerEmail !== user.email) {
        const emailExists = await prisma.user.findUnique({ where: { email: lowerEmail } });
        if (emailExists) {
          return res.status(400).json({ error: "Email address is already in use by another account." });
        }
        updateData.email = lowerEmail;
      }
    }

    if (phoneNumber !== undefined) {
      updateData.phoneNumber = phoneNumber;
    }

    if (gender !== undefined) {
      if (gender && !["MALE", "FEMALE", "OTHER"].includes(gender)) {
        return res.status(400).json({ error: "Invalid gender choice. Must be MALE, FEMALE, or OTHER." });
      }
      updateData.gender = gender || null;
    }

    if (dateOfBirth !== undefined) {
      updateData.dateOfBirth = dateOfBirth ? new Date(dateOfBirth) : null;
    }

    if (address !== undefined) {
      updateData.address = address;
    }

    if (bio !== undefined) {
      updateData.bio = bio;
    }

    if (profileImageUrl !== undefined) {
      updateData.profileImageUrl = profileImageUrl;
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: updateData
    });

    const token = generateToken(updated);

    return res.status(200).json({
      message: "Profile updated successfully.",
      user: {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        phoneNumber: updated.phoneNumber,
        gender: updated.gender,
        dateOfBirth: updated.dateOfBirth,
        address: updated.address,
        bio: updated.bio,
        profileImageUrl: updated.profileImageUrl,
        role: updated.role,
        isEmailVerified: updated.isEmailVerified,
        createdAt: updated.createdAt
      },
      token
    });
  } catch (error: any) {
    console.error("Edit profile error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
