const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const multer = require('multer');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Stockage pour les documents justificatifs (PDF, images)
const documentStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'filezen/documents',
    allowed_formats: ['pdf', 'jpg', 'jpeg', 'png'],
    resource_type: 'auto',
  },
});

// Stockage pour les photos de profil
const profileStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'filezen/profiles',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 400, height: 400, crop: 'fill', gravity: 'face' }],
  },
});

// Stockage pour les photos d'établissement
const etablissementStorage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: 'filezen/etablissements',
    allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
    transformation: [{ width: 800, height: 600, crop: 'fill' }],
  },
});

const uploadDocument = multer({
  storage: documentStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const uploadProfile = multer({
  storage: profileStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

const uploadEtablissement = multer({
  storage: etablissementStorage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
});

module.exports = { uploadDocument, uploadProfile, uploadEtablissement, cloudinary };
