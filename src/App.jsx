import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { ChakraProvider } from '@chakra-ui/react';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { useState, useEffect } from 'react';
import Login from './components/Login';
import Chat from './components/Chat';

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyAhzUxXjCu6dAH-onioiuzrWSeATgUDI4o",
    authDomain: "chat-app-19d1e.firebaseapp.com",
    databaseURL: "https://chat-app-19d1e-default-rtdb.firebaseio.com",
    projectId: "chat-app-19d1e",
    storageBucket: "chat-app-19d1e.firebasestorage.app",
    messagingSenderId: "337572849635",
    appId: "1:337572849635:web:6791a67a01d32ce18ce2d6"
  };

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const database = getDatabase(app);

function App() {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((user) => {
      setUser(user);
    });

    return () => unsubscribe();
  }, []);

  return (
    <ChakraProvider>
      <Router>
        <Routes>
          <Route
            path="/"
            element={
              user ? (
                <Navigate to="/chat" />
              ) : (
                <Navigate to="/login" />
              )
            }
          />
          <Route
            path="/login"
            element={user ? <Navigate to="/chat" /> : <Login />}
          />
          <Route
            path="/chat"
            element={user ? <Chat user={user} /> : <Navigate to="/login" />}
          />
        </Routes>
      </Router>
    </ChakraProvider>
  );
}

export default App;