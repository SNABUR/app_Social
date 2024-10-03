const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const axios = require('axios'); // Importa axios
require("dotenv").config();
const app = express();
app.use(express.json());

app.use(cors({
    origin: 'https://goldengcoin.github.io', // Restringe los orígenes permitidos
    //origin: 'http://localhost:5173', // Restringe los orígenes permitidos
  }));
  
// Conexión a MongoDB
mongoose.connect(process.env.CREDENTIALS_MONGO_DB);


const userSchema = new mongoose.Schema({
    walletAddress: { type: String, unique: true, required: true },  // Asegura que cada walletAddress sea única
    username: { type: String, default: 'Anonymous' },  // Puedes agregar más campos en el futuro
    profileImage: { type: String, default: '' }  // Imagen de perfil (opcional)
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

// Crear un nuevo usuario
app.post('/users', async (req, res) => {
    const { walletAddress } = req.body;

    try {
        // Verifica si el usuario ya existe
        let user = await User.findOne({ walletAddress });
        if (!user) {
            user = new User({ walletAddress});
            await user.save();
        }
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Error al crear o obtener el usuario' });
    }
});

// Obtener un usuario por dirección de wallet
app.get('/users/:walletAddress', async (req, res) => {
    const { walletAddress } = req.params;
    try {
        // Busca el usuario en la base de datos
        const user = await User.findOne({ walletAddress });
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
        }

        // Hacer una llamada a la API de Coinbase para obtener el balance del usuario
        const coinbaseResponse = await axios.post('https://api.developer.coinbase.com/rpc/v1/base-sepolia/yCYGyekgTfIGKsj-ZM_MQnJmbufDhUMh', {
            jsonrpc: "2.0",
            id: 1,
            method: "cdp_listBalances",
            params: [{
                address: walletAddress,
                pageToken: "",
                pageSize: 12
            }]
        }, {
            headers: {
                "Content-Type": "application/json"
            }
        });

        // Devuelve el usuario y el balance de la API de Coinbase
        res.json({ user, BaseBalances: coinbaseResponse.data });
    } catch (error) {
        console.error("Error al obtener el usuario o balance:", error);
        res.status(500).json({ message: 'Error al obtener el usuario o balance' });
    }
});



///////comments/////////

// Ruta para agregar un nuevo comentario con tableName, chainNet, y walletAddress
app.post('/comments', async (req, res) => {
    const { text, media, tableName, chainNet, walletAddress } = req.body;

    try {
        // Buscar el usuario por su dirección de wallet
        const user = await User.findOne({ walletAddress });
        if (!user) {
            return res.status(404).json({ message: 'Usuario no encontrado' });
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
        res.json(newComment);
    } catch (error) {
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
