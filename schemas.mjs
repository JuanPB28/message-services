import mongoose from 'mongoose';

export const UserSchema = new mongoose.Schema({
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      unique: true,
      match: /^[a-zA-Z0-9]+$/,
    },
    password: {
      type: String,
      required: true,
      minlength: 4,
    },
    image: {
      type: String,
      required: true,
    }
  });
  
  export const MessageSchema = new mongoose.Schema({
    from: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    to: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
    },
    image: {
      type: String,
    },
    sent: {
      type: String,
      required: true,
      trim: true,
      minlength: 10,
    }
  });

  export const UserModel = mongoose.model('User', UserSchema);

  export const MessageModel = mongoose.model('Message', MessageSchema);
  