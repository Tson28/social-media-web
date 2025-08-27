import { createServer } from 'http';
import { Server } from 'socket.io';
import express from 'express';

const app = express();

// Middleware
app.use(express.json());
app.use(express.static('dist'));

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', 'http://localhost:3000');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// In-memory storage for demo (in production, use a database)
let users = [
  {
    _id: '1',
    username: 'demo',
    email: 'demo@example.com',
    password: 'demo123'
  }
];

// Sample data for demo
let posts = [
  {
    _id: '1',
    userId: '1',
    username: 'demo',
    content: 'Hello! This is my first post on this social media platform! 🎉',
    timestamp: new Date().toISOString(),
    likes: 5,
    comments: [
      { id: '1', username: 'friend1', content: 'Welcome! 👋', timestamp: new Date().toISOString() }
    ]
  },
  {
    _id: '2',
    userId: '1',
    username: 'demo',
    content: 'Just exploring the features here. The UI looks great! ✨',
    timestamp: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
    likes: 3,
    comments: []
  }
];

let friends = [
  { _id: '2', username: 'friend1', email: 'friend1@example.com' },
  { _id: '3', username: 'friend2', email: 'friend2@example.com' },
  { _id: '4', username: 'friend3', email: 'friend3@example.com' }
];

let notifications = [
  { _id: '1', userId: '1', type: 'friend_request', message: 'friend1 sent you a friend request', timestamp: new Date().toISOString() },
  { _id: '2', userId: '1', type: 'like', message: 'friend2 liked your post', timestamp: new Date(Date.now() - 1800000).toISOString() }
];

// API Routes
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  const user = users.find(u => 
    (u.username === username || u.email === username) && u.password === password
  );
  
  if (user) {
    const { password, ...userWithoutPassword } = user;
    res.json(userWithoutPassword);
  } else {
    res.status(401).json({ message: 'Invalid credentials' });
  }
});

app.post('/api/users', (req, res) => {
  const { username, email, password } = req.body;
  
  // Check if user already exists
  if (users.find(u => u.username === username || u.email === email)) {
    return res.status(400).json({ message: 'User already exists' });
  }
  
  // Create new user
  const newUser = {
    _id: Date.now().toString(),
    username,
    email,
    password
  };
  
  users.push(newUser);
  
  const { password: _, ...userWithoutPassword } = newUser;
  res.status(201).json(userWithoutPassword);
});

// Get posts
app.get('/api/posts', (req, res) => {
  res.json(posts);
});

// Get posts by user
app.get('/api/posts/user/:userId', (req, res) => {
  const userPosts = posts.filter(post => post.userId === req.params.userId);
  res.json(userPosts);
});

// Create new post
app.post('/api/posts', (req, res) => {
  const { userId, content } = req.body;
  const user = users.find(u => u._id === userId);
  
  if (!user) {
    return res.status(404).json({ message: 'User not found' });
  }
  
  const newPost = {
    _id: Date.now().toString(),
    userId,
    username: user.username,
    content,
    timestamp: new Date().toISOString(),
    likes: 0,
    comments: []
  };
  
  posts.push(newPost);
  res.status(201).json(newPost);
});

// Get friends
app.get('/api/friends', (req, res) => {
  res.json(friends);
});

// Get notifications
app.get('/api/notifications/:userId', (req, res) => {
  const userNotifications = notifications.filter(n => n.userId === req.params.userId);
  res.json(userNotifications);
});

// Search users
app.get('/api/users/search', (req, res) => {
  const { q } = req.query;
  if (!q) {
    return res.json([]);
  }
  
  const searchResults = users.filter(user => 
    user.username.toLowerCase().includes(q.toLowerCase()) ||
    user.email.toLowerCase().includes(q.toLowerCase())
  ).map(user => {
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  });
  
  res.json(searchResults);
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: `http://localhost:3000`,
  },
});

io.use((socket, next) => {
  socket.userId = socket.handshake.auth.user._id;
  socket.username = socket.handshake.auth.user.username;
  next();
});

io.on('connection', (socket) => {
  console.log(`user ${socket.userId} connected with socket id ${socket.id}`);

  socket.on('friendRequest', (friendId) => {
    for (let [id, socket] of io.sockets.sockets) {
      if (socket.userId == friendId) {
        console.log(`sending friend request to client ${id}`);
        io.to(id).emit('friendRequest', {
          userId: socket.userId,
          username: socket.username,
        });
        break;
      }
    }
  });

  socket.on('friendRequestAccepted', (friendId) => {
    for (let [id, socket] of io.sockets.sockets) {
      if (socket.userId == friendId) {
        console.log(`sending friend request accepted to client ${id}`);
        io.to(id).emit('friendRequestAccepted', {
          userId: socket.userId,
          username: socket.username,
        });
        break;
      }
    }
  });

  socket.on('newPost', ({ postId, friendIds }) => {
    for (let [id, socket] of io.sockets.sockets) {
      if (friendIds.includes(socket.userId)) {
        console.log(`sending new post to client ${id}`);
        io.to(id).emit('newPost', {
          postId: postId,
          userId: socket.userId,
          username: socket.username,
        });
      }
    }
  });

  socket.on('newLike', ({ postId, userId }) => {
    for (let [id, socket] of io.sockets.sockets) {
      if (socket.userId == userId) {
        console.log(`sending new like to client ${id}`);
        io.to(id).emit('newLike', {
          postId: postId,
          userId: socket.userId,
          username: socket.username,
        });
        break;
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`user ${socket.userId} disconnected`);
  });
});

const port = process.env.PORT || 5000;
httpServer.listen(port, () => {
  console.log(`listening on *:${port}`);
});
