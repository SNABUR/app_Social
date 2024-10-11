const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); // Importa axios
require("dotenv").config();
const app = express();
const publicClient =require('./client');
app.use(express.json());

app.use(cors({
    origin: 'https://ggeese.github.io', // Restringe los orígenes permitidos
    //origin: 'http://localhost:5173', // Restringe los orígenes permitidos
  }));
  
// Conexión a MongoDB
mongoose.connect(process.env.CREDENTIALS_MONGO_DB);


const userSchema = new mongoose.Schema({
    walletAddress: { type: String, unique: true, required: true },  // Asegura que cada walletAddress sea única
    username: { type: String, default: 'Anonymous' },  // Puedes agregar más campos en el futuro
    profileImage: { type: String, default: '' },  // Imagen de perfil (opcional)
    nonce: { type: String } // Agregar el campo nonce
});

const User = mongoose.model('User', userSchema);

const commentSchema = new mongoose.Schema({
    text: String,
    date: String,  // Fecha del comentario
    media: String,
    tableName: String, // Nombre del contrato
    chainNet: String,  // Red de blockchain
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // Referencia al usuario
    walletAddress: { type: String, required: true },  // Dirección de la wallet del usuario

});

commentSchema.index({ tableName: 1, chainNet: 1 });

const Comment = mongoose.model('Comment', commentSchema);

//getting coinbase balance
const getCoinbaseBalance = async (address) => {
    try {
        const response = await axios.post('https://api.developer.coinbase.com/rpc/v1/base/yCYGyekgTfIGKsj-ZM_MQnJmbufDhUMh', {
            jsonrpc: "2.0",
            id: 1,
            method: "cdp_listBalances",
            params: [{
                address: address,
                pageToken: "",
                pageSize: 12
            }]
        }, {
            headers: {
                "Content-Type": "application/json"
            }
        });

        return response.data; // Return the response data
    } catch (error) {
        console.error("Error fetching Coinbase balance:", error);
        throw new Error('Error fetching Coinbase balance');
    }
};

const verifySignature = async (nonce, signature, walletAddress) => {

    const validSigner = await publicClient.verifyMessage({
        address: walletAddress,
        message: nonce,
        signature,
        })
    return validSigner;
};

app.get('/generateNonce/:walletAddress', async (req, res) => {
    const { walletAddress } = req.params;
    const nonce = Math.floor(Math.random() * 1000000).toString(); // Generate a random nonce

    try {
        // Check if the user exists in the database
        let user = await User.findOne({ walletAddress });

        if (!user) {
            // If user does not exist, create a new user with the nonce
            user = new User({ walletAddress, nonce });
            await user.save();
        } else {
            // If user exists, update the nonce
            user.nonce = nonce;
            await user.save();
        }

        // Return the nonce to the frontend for signing
        res.json({ nonce });
    } catch (error) {
        console.error('Error generating nonce:', error);
        res.status(500).json({ message: 'Error generating nonce' });
    }
});

// Autentificar nonce
app.post('/authenticate', async (req, res) => {
    const { walletAddress, signature, type } = req.body;
    
    // Check if walletAddress is provided
    if (!walletAddress) {
        return res.status(400).json({ error: "walletAddress is required" });
    }


    try {
        // Find the user by wallet address
        const user = await User.findOne({ walletAddress });

        if (!user) {
            return res.status(400).json({ message: 'User does not exist' });
        }

        if (await verifySignature(user.nonce, signature, walletAddress, type)) {
            // If signature is valid, authentication is successful
            let coinbaseData = [];
            try {
                coinbaseData = await getCoinbaseBalance(walletAddress);
            } catch (err) {
                console.error('Failed to fetch Coinbase balance:', err);
                coinbaseData = []; // If it fails, return an empty array
            }
            // Fetch Coinbase balance

            // Devuelve el usuario y el balance de la API de Coinbase
            res.json({ message: 'Authentication successful', walletAddress, user, BaseBalances: coinbaseData });
        } else {
            res.status(401).json({ message: 'Invalid signature' });
        }
    } catch (error) {
        console.error("Error during authentication:", error);
        res.status(500).json({ message: 'Error during authentication' });
    }
});

///////comments/////////
// Ruta para agregar un nuevo comentario con tableName, chainNet, y walletAddress
app.post('/comments', async (req, res) => {
    const { text, media, tableName, chainNet, walletAddress, nonce } = req.body;

    try {
        // Buscar el usuario por su dirección de wallet
        let user = await User.findOne({ walletAddress });
        if (!user) {
            user = new User({ walletAddress });
            await user.save();
        }
        
        // Verifica el nonce
        if (!user.nonce) {
            // Si no hay nonce, genera uno nuevo
            const newNonce = Math.floor(Math.random() * 1000000).toString();
            await User.updateOne({ walletAddress }, { $set: { nonce: newNonce } });
            return res.status(400).json({ message: 'Nonce not found, a new one has been generated. Please retry with the new nonce.', newNonce });
        }
        // Verifica el nonce
        if (user.nonce !== nonce) {
            return res.status(400).json({ message: 'Invalid nonce' });
        }
        // Calcular la fecha actual en el backend
        const date = Math.floor(Date.now());  // Timestamp Unix en segundos

        const newComment = new Comment({
            text,
            date,
            media,
            tableName,
            chainNet,
            user: user._id,
            walletAddress,  // Guarda la dirección de la wallet con el comentario
        });
        await newComment.save();

        await User.updateOne({ walletAddress }, { $unset: { nonce: "" } });

        res.json(newComment);
    } catch (error) {
        console.error('Error al crear el comentario o el usuario:', error);
        res.status(500).json({ message: 'Error al crear el comentario' });
    }
});

// Ruta para obtener comentarios filtrados por tableName y chainNet
app.get('/comments', async (req, res) => {
    const { tableName, chainNet } = req.query;
    try {
        // Verifica que tableName y chainNet están presentes en la consulta
        if (!tableName || !chainNet) {
            return res.status(400).json({ message: 'need more parameters' });
        }
        
        const comments = await Comment.find({ tableName, chainNet })
            .populate('user', 'username walletAddress profileImage') // Asegúrate de que el campo user se está poblando correctamente
            .sort({ _id: -1 }) // Ordena en orden descendente
            .limit(20); // Limita a los últimos 20 comentarios

        res.json(comments);
    } catch (error) {
        console.error("Error al obtener los comentarios:", error); // Agrega un log más detallado del error
        res.status(500).json({ message: 'Error al obtener los comentarios' });
    }
});

// Iniciar el servidor
app.listen(5000, () => {
    console.log('Server is running on port 5000');
});
