import React, { useState, useEffect } from "react";
import { 
  createBrowserRouter, 
  RouterProvider, 
  Navigate,
  createRoutesFromElements,
  Route
} from "react-router-dom";
import Login from "./Login";
import Register from "./Register";
import DeviceManager from "./DeviceManager";
import Dashboard from "./Dashboard";
import "./App.css";

// Enable v7 features
const router = createBrowserRouter(
  createRoutesFromElements(
    <>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/app" element={<DeviceManager />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/" element={<Navigate to="/login" replace />} />
    </>
  ),
  {
    future: {
      v7_startTransition: true,
      v7_relativeSplatPath: true
    }
  }
);

function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAuthStatus = async () => {
      const loginStatus = localStorage.getItem("isLoggedIn");
      if (loginStatus === "true") {
        setIsLoggedIn(true);
      }
      setLoading(false);
    };

    checkAuthStatus();
  }, []);

  const handleLogin = () => {
    setIsLoggedIn(true);
  };

  const handleLogout = () => {
    // Clear all auth state
    setIsLoggedIn(false);
    localStorage.clear(); // Clear all localStorage items
    window.location.href = '/login'; // Force a full page reload
  };

  if (loading) {
    return (
      <div className="loading">
        <div>Loading...</div>
      </div>
    );
  }

  // Wrap the router with auth logic
  const routes = createBrowserRouter(
    createRoutesFromElements(
      <>
        <Route 
          path="/login" 
          element={isLoggedIn ? <Navigate to="/app" replace /> : <Login onLogin={handleLogin} />} 
        />
        <Route 
          path="/register" 
          element={isLoggedIn ? <Navigate to="/app" replace /> : <Register />} 
        />
        <Route 
          path="/app" 
          element={isLoggedIn ? <DeviceManager onLogout={handleLogout} /> : <Navigate to="/login" replace />} 
        />
        <Route 
          path="/dashboard" 
          element={isLoggedIn ? <Dashboard onLogout={handleLogout} /> : <Navigate to="/login" replace />} 
        />
        <Route 
          path="/" 
          element={isLoggedIn ? <Navigate to="/app" replace /> : <Navigate to="/login" replace />} 
        />
      </>
    ),
    {
      future: {
        v7_startTransition: true,
        v7_relativeSplatPath: true
      }
    }
  );

  return <RouterProvider router={routes} />;
}

export default App;