// src/lib/firebase.js
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc } from 'firebase/firestore';

// Configuración de Firebase usando variables de entorno
const firebaseConfig = {
  apiKey: import.meta.env.FIREBASE_API_KEY,
  authDomain: import.meta.env.FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.FIREBASE_APP_ID,
};

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// Nombre de la colección
const COLLECTION_NAME = 'lomo_aleman_branches';

// Función para obtener todos los documentos de la colección
export async function getAllBranches() {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const branches = [];

    querySnapshot.forEach((doc) => {
      branches.push({
        id: doc.id,
        ...doc.data()
      });
    });

    console.debug(`✅ Se obtuvieron ${branches.length} locales de Firestore`);
    return branches;
  } catch (error) {
    console.error('❌ Error al obtener locales:', error);
    return []; // Retorna array vacío si hay error
  }
}

// Función para obtener un documento específico por ID
export async function getBranchBySlug(slug) {
  try {
    // Usar el slug como ID del documento
    const docRef = doc(db, COLLECTION_NAME, slug);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      const branchData = {
        id: docSnap.id,
        ...docSnap.data()
      };
      console.log(`✅ Local encontrado: ${branchData.name}`);
      return branchData;
    } else {
      console.log(`⚠️ No se encontró local con slug: ${slug}`);
      return null;
    }
  } catch (error) {
    console.error(`❌ Error al obtener local ${slug}:`, error);
    return null;
  }
}

// Función para obtener todos los slugs de los documentos en la colección
export async function getBranchSlugs() {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
    const slugs = [];

    querySnapshot.forEach((doc) => {
      // El slug debería ser el ID del documento
      slugs.push(doc.id);
    });

    console.log(`✅ Se obtuvieron ${slugs.length} slugs para rutas estáticas`);
    return slugs;
  } catch (error) {
    console.error('❌ Error al obtener slugs:', error);
    return [];
  }
}

// Función para probar la conexión a Firestore
export async function testFirestoreConnection() {
  try {
    await getDocs(collection(db, COLLECTION_NAME));
    console.log('✅ Conexión a Firestore exitosa');
    return true;
  } catch (error) {
    console.error('❌ Error de conexión a Firestore:', error);
    return false;
  }
}