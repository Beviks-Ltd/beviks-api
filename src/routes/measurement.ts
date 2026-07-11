import { Router, Request, Response } from "express";
import { prisma } from "../db.js";

export const measurementRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MeasurementProfileResponse:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         userId:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         gender:
 *           type: string
 *           enum: [MALE, FEMALE]
 *         unit:
 *           type: string
 *           enum: [cm, inch]
 *         neck_circumference:
 *           type: number
 *           nullable: true
 *         shoulder_width:
 *           type: number
 *           nullable: true
 *         bust_circumference:
 *           type: number
 *           nullable: true
 *         under_bust:
 *           type: number
 *           nullable: true
 *         natural_waist:
 *           type: number
 *           nullable: true
 *         bicep_girth:
 *           type: number
 *           nullable: true
 *         wrist_circumference:
 *           type: number
 *           nullable: true
 *         hips_full:
 *           type: number
 *           nullable: true
 *         skirt_length:
 *           type: number
 *           nullable: true
 *         neck_collar:
 *           type: number
 *           nullable: true
 *         shoulder_breadth:
 *           type: number
 *           nullable: true
 *         chest_girth:
 *           type: number
 *           nullable: true
 *         stomach_mid:
 *           type: number
 *           nullable: true
 *         waist_line:
 *           type: number
 *           nullable: true
 *         arm_hole:
 *           type: number
 *           nullable: true
 *         cuff_girth:
 *           type: number
 *           nullable: true
 *         seat_hips:
 *           type: number
 *           nullable: true
 *         outseam:
 *           type: number
 *           nullable: true
 *         sleeve_length:
 *           type: number
 *           nullable: true
 *         trouser_rise:
 *           type: number
 *           nullable: true
 *         inseam:
 *           type: number
 *           nullable: true
 *         agbada_span:
 *           type: number
 *           nullable: true
 *         kaftan_length:
 *           type: number
 *           nullable: true
 *         head_circumference:
 *           type: number
 *           nullable: true
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

/**
 * @openapi
 * /api/measurements:
 *   post:
 *     summary: Create Sizing Measurement Profile
 *     description: Creates a user measurement profile supporting CM or INCH units, MALE or FEMALE indicators, and optional cultural tailoring fields (e.g. Agbada span).
 *     tags:
 *       - Measurements
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *               - name
 *               - gender
 *               - unit
 *             properties:
 *               userId:
 *                 type: string
 *                 format: uuid
 *                 example: e634127c-9b76-47ee-8cd6-c67ee59d9972
 *               name:
 *                 type: string
 *                 example: "My Wedding Gown Sizing"
 *               gender:
 *                 type: string
 *                 enum: [MALE, FEMALE]
 *                 example: FEMALE
 *               unit:
 *                 type: string
 *                 enum: [cm, inch]
 *                 example: inch
 *               neck_circumference:
 *                 type: number
 *                 example: 13.5
 *               shoulder_width:
 *                 type: number
 *                 example: 15.0
 *               bust_circumference:
 *                 type: number
 *                 example: 34.0
 *               under_bust:
 *                 type: number
 *                 example: 28.5
 *               natural_waist:
 *                 type: number
 *                 example: 26.0
 *               sleeve_length:
 *                 type: number
 *                 example: 22.0
 *               hips_full:
 *                 type: number
 *                 example: 36.5
 *     responses:
 *       201:
 *         description: Sizing profile created.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MeasurementProfileResponse'
 *       400:
 *         description: Missing parameters or invalid gender/unit choices.
 */
measurementRouter.post("/", async (req: Request, res: Response): Promise<any> => {
  try {
    const {
      userId,
      name,
      gender,
      unit,
      neck_circumference,
      shoulder_width,
      bust_circumference,
      under_bust,
      natural_waist,
      bicep_girth,
      wrist_circumference,
      hips_full,
      skirt_length,
      neck_collar,
      shoulder_breadth,
      chest_girth,
      stomach_mid,
      waist_line,
      arm_hole,
      cuff_girth,
      seat_hips,
      outseam,
      sleeve_length,
      trouser_rise,
      inseam,
      agbada_span,
      kaftan_length,
      head_circumference
    } = req.body;

    if (!userId || !name || !gender || !unit) {
      return res.status(400).json({ error: "userId, name, gender, and unit are required fields." });
    }

    if (gender !== "MALE" && gender !== "FEMALE") {
      return res.status(400).json({ error: "gender must be either MALE or FEMALE." });
    }

    if (unit !== "cm" && unit !== "inch") {
      return res.status(400).json({ error: "unit must be either cm or inch." });
    }

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const profile = await prisma.measurementProfile.create({
      data: {
        userId,
        name,
        gender,
        unit,
        neck_circumference,
        shoulder_width,
        bust_circumference,
        under_bust,
        natural_waist,
        bicep_girth,
        wrist_circumference,
        hips_full,
        skirt_length,
        neck_collar,
        shoulder_breadth,
        chest_girth,
        stomach_mid,
        waist_line,
        arm_hole,
        cuff_girth,
        seat_hips,
        outseam,
        sleeve_length,
        trouser_rise,
        inseam,
        agbada_span,
        kaftan_length,
        head_circumference
      }
    });

    return res.status(201).json(profile);
  } catch (error: any) {
    console.error("Create measurement profile error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/measurements/user/{userId}:
 *   get:
 *     summary: Retrieve User's Sizing Profiles
 *     description: Lists all sizing profiles created by a specific user (allows dropdown selection on storefront checkouts).
 *     tags:
 *       - Measurements
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: List of measurement profiles.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/MeasurementProfileResponse'
 */
measurementRouter.get("/user/:userId", async (req: Request, res: Response): Promise<any> => {
  try {
    const userId = req.params.userId as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ error: "User account not found." });
    }

    const profiles = await prisma.measurementProfile.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" }
    });

    return res.status(200).json(profiles);
  } catch (error: any) {
    console.error("Get user measurement profiles error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/measurements/{id}:
 *   get:
 *     summary: Get Sizing Profile Detail
 *     description: Returns detailed measurements for a single profile.
 *     tags:
 *       - Measurements
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Measurement profile details.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MeasurementProfileResponse'
 *       404:
 *         description: Sizing profile not found.
 */
measurementRouter.get("/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const profile = await prisma.measurementProfile.findUnique({ where: { id } });
    if (!profile) {
      return res.status(404).json({ error: "Measurement profile not found." });
    }

    return res.status(200).json(profile);
  } catch (error: any) {
    console.error("Get measurement profile error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/measurements/{id}:
 *   put:
 *     summary: Edit Sizing Measurement Profile
 *     description: Updates name, metrics, and unit sizing on an existing profile.
 *     tags:
 *       - Measurements
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - gender
 *               - unit
 *             properties:
 *               name:
 *                 type: string
 *               gender:
 *                 type: string
 *                 enum: [MALE, FEMALE]
 *               unit:
 *                 type: string
 *                 enum: [cm, inch]
 *     responses:
 *       200:
 *         description: Sizing profile successfully updated.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MeasurementProfileResponse'
 *       404:
 *         description: Profile not found.
 */
measurementRouter.put("/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;
    const {
      name,
      gender,
      unit,
      neck_circumference,
      shoulder_width,
      bust_circumference,
      under_bust,
      natural_waist,
      bicep_girth,
      wrist_circumference,
      hips_full,
      skirt_length,
      neck_collar,
      shoulder_breadth,
      chest_girth,
      stomach_mid,
      waist_line,
      arm_hole,
      cuff_girth,
      seat_hips,
      outseam,
      sleeve_length,
      trouser_rise,
      inseam,
      agbada_span,
      kaftan_length,
      head_circumference
    } = req.body;

    if (!name || !gender || !unit) {
      return res.status(400).json({ error: "name, gender, and unit are required fields." });
    }

    if (gender !== "MALE" && gender !== "FEMALE") {
      return res.status(400).json({ error: "gender must be either MALE or FEMALE." });
    }

    if (unit !== "cm" && unit !== "inch") {
      return res.status(400).json({ error: "unit must be either cm or inch." });
    }

    const profile = await prisma.measurementProfile.findUnique({ where: { id } });
    if (!profile) {
      return res.status(404).json({ error: "Measurement profile not found." });
    }

    const updatedProfile = await prisma.measurementProfile.update({
      where: { id },
      data: {
        name,
        gender,
        unit,
        neck_circumference,
        shoulder_width,
        bust_circumference,
        under_bust,
        natural_waist,
        bicep_girth,
        wrist_circumference,
        hips_full,
        skirt_length,
        neck_collar,
        shoulder_breadth,
        chest_girth,
        stomach_mid,
        waist_line,
        arm_hole,
        cuff_girth,
        seat_hips,
        outseam,
        sleeve_length,
        trouser_rise,
        inseam,
        agbada_span,
        kaftan_length,
        head_circumference
      }
    });

    return res.status(200).json(updatedProfile);
  } catch (error: any) {
    console.error("Update measurement profile error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/measurements/{id}:
 *   delete:
 *     summary: Delete Sizing Measurement Profile
 *     description: Permanently removes a sizing configuration profile.
 *     tags:
 *       - Measurements
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Profile deleted successfully.
 *       404:
 *         description: Sizing profile not found.
 */
measurementRouter.delete("/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const profile = await prisma.measurementProfile.findUnique({ where: { id } });
    if (!profile) {
      return res.status(404).json({ error: "Measurement profile not found." });
    }

    await prisma.measurementProfile.delete({ where: { id } });

    return res.status(200).json({ message: "Measurement profile successfully deleted." });
  } catch (error: any) {
    console.error("Delete measurement profile error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * @openapi
 * /api/measurements/{id}/download:
 *   get:
 *     summary: Download Sizing Measurement Profile Report
 *     description: Generates and returns a downloadable plain text (.txt) file containing a formatted, readable report of all custom client measurements.
 *     tags:
 *       - Measurements
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Sizing profile report file download.
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       404:
 *         description: Measurement profile not found.
 */
measurementRouter.get("/:id/download", async (req: Request, res: Response): Promise<any> => {
  try {
    const id = req.params.id as string;

    const profile = await prisma.measurementProfile.findUnique({ where: { id } });
    if (!profile) {
      return res.status(404).json({ error: "Measurement profile not found." });
    }

    const keys = [
      "neck_circumference", "shoulder_width", "bust_circumference", "under_bust", "natural_waist",
      "bicep_girth", "wrist_circumference", "hips_full", "skirt_length",
      "neck_collar", "shoulder_breadth", "chest_girth", "stomach_mid",
      "waist_line", "arm_hole", "cuff_girth", "seat_hips", "outseam",
      "thigh_girth", "knee_circumference", "calf_girth", "ankle_girth",
      "inseam", "body_rise", "cross_rise", "total_rise", "back_waist_length",
      "arm_length_shoulder_wrist", "arm_length_neck_wrist", "shoulder_neck_wrist",
      "back_width", "front_chest_width", "bust_point_bust_point", "shoulder_bust_point",
      "shoulder_waist_front", "nape_waist_back", "waist_hip", "waist_floor_front",
      "waist_floor_back", "waist_knee_front", "waist_knee_back", "agbada_span",
      "cap_span", "half_length_front", "half_length_back", "trouser_waist",
      "trouser_length", "cap_size", "custom_1_name", "custom_1_value",
      "custom_2_name", "custom_2_value", "custom_3_name", "custom_3_value"
    ];

    let text = `==================================================\n`;
    text += `BEVIKS Bespoke Sizing Profile Report\n`;
    text += `==================================================\n\n`;
    text += `Profile Name: ${profile.name}\n`;
    text += `Gender: ${profile.gender}\n`;
    text += `Unit: ${profile.unit}\n`;
    text += `Created At: ${new Date(profile.createdAt).toLocaleDateString()}\n\n`;
    text += `--------------------------------------------------\n`;
    text += `Measurement Details:\n`;
    text += `--------------------------------------------------\n`;

    for (const key of keys) {
      const val = (profile as any)[key];
      if (val !== null && val !== undefined && val !== "") {
        const label = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        text += `${label}: ${val} ${profile.unit}\n`;
      }
    }

    text += `\n==================================================\n`;
    text += `Generated by Beviks Ltd. Studio API\n`;

    const sanitizedFilename = profile.name.replace(/[^a-zA-Z0-9]/g, "_");
    res.setHeader("Content-Type", "text/plain");
    res.setHeader("Content-Disposition", `attachment; filename="measurement_profile_${sanitizedFilename}.txt"`);

    return res.status(200).send(text);
  } catch (error: any) {
    console.error("Download measurement profile error:", error);
    return res.status(500).json({ error: "Internal Server Error" });
  }
});
