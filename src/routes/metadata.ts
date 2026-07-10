import { Router, Request, Response } from "express";

export const metadataRouter = Router();

/**
 * @openapi
 * components:
 *   schemas:
 *     MetadataOptionsResponse:
 *       type: object
 *       properties:
 *         categories:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Bridal Wear", "Evening Gowns", "Traditional Wear"]
 *         heritages:
 *           type: object
 *           properties:
 *             Africa:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["Yoruba (Aso Oke / Iro & Buba)", "Ghanaian (Kente)"]
 *             Asia:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["Chinese (Qipao / Hanfu)", "Indian (Sari / Lehenga)"]
 *             MiddleEast:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["Moroccan (Takchita)", "Levantine (Tatreez)"]
 *             Other:
 *               type: array
 *               items:
 *                 type: string
 *               example: ["Western Modern", "Latin American Traditional"]
 */

/**
 * @openapi
 * /api/metadata/options:
 *   get:
 *     summary: Retrieve Design Categories & Cultural Heritages
 *     description: Returns the curated listing of traditional global dress categories and regional heritages.
 *     tags:
 *       - Metadata
 *     responses:
 *       200:
 *         description: Metadata options retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/MetadataOptionsResponse'
 */
metadataRouter.get("/options", (req: Request, res: Response) => {
  const options = {
    categories: [
      "Bridal Wear",
      "Evening Gowns",
      "Traditional Wear",
      "Kaftans & Abayas",
      "Cocktail & Party",
      "Pret-a-Porter (Ready-to-Wear)",
      "Haute Couture (Bespoke/Custom)",
      "Festive & Ceremonial"
    ],
    heritages: {
      Africa: [
        "Yoruba (Aso Oke / Iro & Buba)",
        "Igbo (Isiagu)",
        "Hausa / Fulani",
        "Ghanaian (Kente)",
        "Zulu / Xhosa Traditional",
        "East African (Kitenge / Habesha)",
        "North African (Kaftan / Djellaba)"
      ],
      Asia: [
        "Chinese (Qipao / Hanfu / Qun Kwa)",
        "Indian (Sari / Lehenga / Anarkali)",
        "Japanese (Kimono / Shiromuku)",
        "Korean (Hanbok)",
        "Southeast Asian (Kebaya / Ao Dai)"
      ],
      MiddleEast: [
        "Levantine (Tatreez Embroidery)",
        "Moroccan (Takchita)",
        "Arabian Gulf (Abaya / Jalabiya / Thobe)",
        "Persian / Central Asian Traditional"
      ],
      Other: [
        "Western Modern",
        "Latin American Traditional"
      ]
    }
  };

  return res.status(200).json(options);
});
