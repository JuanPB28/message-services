import fs from "node:fs/promises";
import jwt from "jsonwebtoken";
import express from "express";
import mongoose from "mongoose";
import sha256 from "sha256";
import { UserModel, MessageModel } from "./schemas.mjs";

//Token config
const TOKEN_SECRET_WORD = process.env.TOKEN_SECRET_WORD || "1234SuperSecret*";
const TOKEN_EXPIRATION_TIME = process.env.TOKEN_EXPIRATION_TIME || "30 minutes";

//MongoDB config
const MONGO_USER = process.env.MONGO_USER || "usuario";
const MONGO_PASS = process.env.MONGO_PASS || "passusuario";
const MONGO_PORT = process.env.MONGO_PORT || "27017";
const MONGO_AUTHSOURCE = process.env.MONGO_AUTHSOURCE || "admin";
const MONGO_URI = process.env.MONGO_URI || `mongodb://${MONGO_USER}:${MONGO_PASS}@mongo:${MONGO_PORT}`;
const MONGO_DB = process.env.MONGO_DB || "messages-db";

//Puerto API
const PORT = process.env.PORT || 3000;

const app = express();
const { pathname: root } = new URL("../message-services", import.meta.url);

app.use(express.json());
app.use(express.static("public"));
app.use("/img", express.static(root + "/public/img"));

//Hello world!
app.get("/", (req, res) => {
  console.log("Request recived: ", req.url);
  res.send("Hello World!");
});

//User services

//Login - Autenticación usuario (devuelve el nombre, la imagen y el token)
app.post("/login", async (req, res) => {
  console.log("Request recived: ", req.url);
  
  try {
    const name = req.body?.name;
    const password = req.body?.password;

    if (!name || !password) {
      return res.status(400).json({ ok: false, error: "Bad request, name or password not found" });
    }

    const user = await UserModel.findOne({ name }); 

    if (!user || user.password !== sha256(password)) {
      return res.status(500).json({ ok: false, error: "User or password incorrect" });
    }

    const token = generateToken(user._id);

    return res.status(200).json({ ok: true, name: user.name, image: user.image, token });
  } catch (error) {
    console.log("Error", error);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

//Registro - Añade un usuario a la BBDD (devuelve la confirmación)
app.post("/register", async (req, res) => {
  console.log("Request recived: ", req.url);

  try {
    const name = req.body?.name;
    const password = req.body?.password;
    const image = req.body?.image;

    if (!name || !password || !image) {
      return res.status(400).json({ ok: false, error: "Bad request, name or password or image not found" });
    }

    const imagePath = `img/${Date.now()}.jpg`;
    const filePath = `./public/${imagePath}`;

    await fs.writeFile(filePath, Buffer.from(image, "base64"));

    const newUser = new UserModel({
      name,
      password: sha256(password),
      image: imagePath
    });

    await newUser.save();
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error", error);
    return res.status(500).json({ ok: false, error: "User couldn't be registered" });
  }
});

//Petición usuarios - Devuelve un array de todos los usuarios siempre y cuando esté autenticado
app.get("/users", async (req, res) => {
  console.log("Request recived: ", req.url);

  if (!validateToken(req.headers.authorization)) {
    return res.sendStatus(401).json({ ok: false, error: "Authentication error" });
  }

  try {
    const users = await UserModel.find();
    return res.status(200).json({ ok: true, users });
  } catch (error) {
    console.log("Error", error);
    return res.status(500).json({ ok: false });
  }
});

//Cambio de imagen de usuario - Devuelve la confirmación
app.put("/users", async (req, res) => {
  console.log("Request recived: ", req.url);

  const token = validateToken(req.headers.authorization);

  if (!token) {
    return res.sendStatus(401).json({ ok: false, error: "Authentication error" });
  }

  try {
    const image = req.body?.image;
    const user = await UserModel.findById(token.id);

    const oldFilePath = `./public/${user.image}`;
    const imagePath = `img/${Date.now()}.jpg`;
    const filePath = `./public/${imagePath}`;
    await fs.writeFile(filePath, Buffer.from(image, "base64"));

    //Eliminar imagen antigua
    removeImage(oldFilePath);

    user.image = imagePath;
    await user.save();

    return res.status(200).json({ ok: true });

  } catch (error) {
    console.log("Error", error);
    return res.status(500).json({ ok: false, error: `Error updating user: ${token.id}` });
  }
});

//Message services

//Petición mensajes - Devuelve un array de todos los mensajes del usuario que ha hecho la solicitud
app.get("/messages", async (req, res) => {
  console.log("Request recived: ", req.url);

  const token = validateToken(req.headers.authorization);

  if (!token) {
    return res.sendStatus(401).json({ ok: false, error: "Authentication error" });
  }

  try {
    const messages = await MessageModel.find({ to: token.id });
    return res.status(200).json({ ok: true, messages });
  } catch (error) {
    console.log("Error", error);
    return res.status(500).json({ ok: false, error: `Error getting messages for user: ${token.id}` });
  }
});

//Nuevo mensaje - Envía un mensaje a otro usuario
app.post('/messages/:toUserId', async (req, res) => {
  console.log("Request recived: ", req.url);

  const token = validateToken(req.headers.authorization);

  if (!token) {
    return res.sendStatus(401).json({ ok: false, error: "Authentication error" });
  }

  try {
    const from = token.id;
    const to = req.params?.toUserId;
    const message = req.body?.message;
    const image = req.body?.image;
    let imagePath = null;

    if (!from || !to || !message) {
      return res.status(400).json({ ok: false, error: "Bad request" });
    }

    if(image){
      imagePath = `img/${Date.now()}.jpg`;
      const filePath = `./public/${imagePath}`;

      await fs.writeFile(filePath, Buffer.from(image, "base64"));
    }
    
    const newMessage = new MessageModel({
      from,
      to,
      message,
      image: imagePath,
      sent: new Date().toUTCString()
    });

    await newMessage.save();

    return res.status(200).json({ ok: true, newMessage });
  } catch (error) {
    console.log("Error", error);
    return res.status(500).json({ ok: false, error: `Error sending message to: ${to}` });
  }
});

//Eliminar mensaje - Elimina el mensaje del que se hace la petición
app.delete('/messages/:id', async (req, res) => {
  console.log("Request recived: ", req.url);

  const token = validateToken(req.headers.authorization);

  if (!token) {
    return res.sendStatus(401).json({ ok: false, error: "Authentication error" });
  }

  try {
    const id = req.params?.id; 
    await MessageModel.findByIdAndDelete(id);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.log("Error", error);
    return res.status(500).json({ ok: false, error: `Error deleting message: ${id}` });
  }
});

//Functions
function generateToken(id) {
  return jwt.sign({ id }, TOKEN_SECRET_WORD, { expiresIn: `${TOKEN_EXPIRATION_TIME}` });
}

function validateToken(token) {
  try {
    return jwt.verify(token, TOKEN_SECRET_WORD);
  } catch (error) {}
}

async function removeImage(path) {
  try {
    await fs.access(path);
    await fs.unlink(path);
    console.log("File deleted successfully.");
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.log("File does not exist.");
    } else {
      console.error("Error deleting file:", err);
    }
  }
}

//Conexión BBDD
mongoose.Promise = global.Promise;
mongoose.connect(MONGO_URI, { dbName: `${MONGO_DB}`, authSource: `${MONGO_AUTHSOURCE}` })
  .then(() => {
    console.log("Connection success");
    app.listen(PORT, () => {
      console.log(`Server listen on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Connection fail", error);
  });