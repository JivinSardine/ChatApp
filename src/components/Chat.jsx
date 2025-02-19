import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Box, VStack, HStack, Input, Button, Text, Avatar, IconButton, useToast, List, ListItem, Center, Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton, useDisclosure, Divider } from '@chakra-ui/react';
import CryptoJS from 'crypto-js';
import { ref, onValue, push, set, serverTimestamp, query, orderByChild, equalTo, get, update } from 'firebase/database';
import { FaVideo, FaPhone, FaMicrophone, FaMicrophoneSlash, FaVideoSlash, FaPaperclip, FaPlus, FaCog } from 'react-icons/fa';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import Peer from 'simple-peer';
import { database, auth } from '../App';

const ViewUserProfileModal = ({ isOpen, onClose, user }) => {
  if (!user) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>Profile Settings</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="center">
            <Avatar
              size="2xl"
              src={user.photoURL}
              name={user.displayName}
            />
            <Text fontSize="xl" fontWeight="bold">
              {user.displayName}
            </Text>
            <Text color="gray.600">
              {user.description || 'No description available'}
            </Text>
            <Text fontSize="sm" color="gray.500">
              Last seen: {formatLastSeen(user.lastSeen)}
            </Text>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="blue" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

const Chat = ({ user }) => {
  const navigate = useNavigate();
  const { isOpen, onOpen, onClose } = useDisclosure();
  const { isOpen: isUserProfileOpen, onOpen: onUserProfileOpen, onClose: onUserProfileClose } = useDisclosure();
  const [newDisplayName, setNewDisplayName] = useState(user.displayName);
  const [newDescription, setNewDescription] = useState('');
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
  const [viewingUser, setViewingUser] = useState(null);
  const [calling, setCalling] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [stream, setStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [unreadMessages, setUnreadMessages] = useState({});
  
  const fileInputRef = useRef();
  const photoInputRef = useRef();
  const peerRef = useRef();
  const localVideoRef = useRef();
  const remoteVideoRef = useRef();
const handleUserClick = (userId) => {
  setSelectedUser(userId);
  setUnreadMessages(prev => ({ ...prev, [userId]: 0 }));
};

const handleProfileClick = (userId) => {
  setViewingUser(users[userId]);
  onUserProfileOpen();
};

const handleProfilePictureChange = async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  const CLOUDINARY_CLOUD_NAME = 'dh77mjbpt';
  const UPLOAD_PRESET = 'ml_default';
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', UPLOAD_PRESET);

  try {
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
      {
        method: 'POST',
        body: formData
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Upload failed');
    }

    const data = await response.json();
    await updateProfile(user, { photoURL: data.secure_url });
    const userRef = ref(database, `users/${user.uid}`);
    await set(userRef, {
      ...users[user.uid],
      photoURL: data.secure_url
    });

    toast({
      title: 'Profile Picture Updated',
      description: 'Your profile picture has been successfully updated',
      status: 'success',
      duration: 3000,
      isClosable: true
    });
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Failed to update profile picture: ' + error.message,
      status: 'error',
      duration: 5000,
      isClosable: true
    });
  }
};

const handleSaveProfile = async () => {
  try {
    const userRef = ref(database, `users/${user.uid}`);
    await set(userRef, {
      ...users[user.uid],
      displayName: newDisplayName,
      description: newDescription
    });
    toast({
      title: 'Profile Updated',
      description: 'Your profile has been successfully updated',
      status: 'success',
      duration: 3000,
      isClosable: true
    });
    onClose();
  } catch (error) {
    toast({
      title: 'Error',
      description: 'Failed to update profile',
      status: 'error',
      duration: 3000,
      isClosable: true
    });
  }
};

const handleSignOut = () => {
  auth.signOut();
};

const handleDeleteAccount = async () => {
  const isConfirmed = window.confirm('Are you sure you want to delete your account? This action cannot be undone.');
  
  if (isConfirmed) {
    try {
      // Delete user data from the database
      const userRef = ref(database, `users/${user.uid}`);
      await set(userRef, null);

      // Delete user's messages
      const messagesQuery = query(ref(database, 'private_messages'));
      const snapshot = await get(messagesQuery);
      if (snapshot.exists()) {
        const updates = {};
        snapshot.forEach((chatSnapshot) => {
          const chatId = chatSnapshot.key;
          if (chatId.includes(user.uid)) {
            updates[`private_messages/${chatId}`] = null;
          }
        });
        if (Object.keys(updates).length > 0) {
          await update(ref(database), updates);
        }
      }

      // Delete user's authentication account
      await user.delete();

      toast({
        title: 'Account Deleted',
        description: 'Your account has been successfully deleted',
        status: 'success',
        duration: 5000,
        isClosable: true
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete account: ' + error.message,
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  }
};

const ViewUserProfileModal = ({ isOpen, onClose, user }) => {
  if (!user) return null;
  
  return (
    <Modal isOpen={isOpen} onClose={onClose}>
      <ModalOverlay />
      <ModalContent>
        <ModalHeader>User Profile</ModalHeader>
        <ModalCloseButton />
        <ModalBody>
          <VStack spacing={4} align="center">
            <Avatar
              size="2xl"
              src={user.photoURL}
              name={user.displayName}
            />
            <Text fontSize="xl" fontWeight="bold">
              {user.displayName}
            </Text>
            <Text color="gray.600">
              {user.description || 'No description available'}
            </Text>
            <Text fontSize="sm" color="gray.500">
              Last seen: {formatLastSeen(user.lastSeen)}
            </Text>
          </VStack>
        </ModalBody>
        <ModalFooter>
          <Button colorScheme="blue" onClick={onClose}>
            Close
          </Button>
        </ModalFooter>
      </ModalContent>
    </Modal>
  );
};

  const toast = useToast();

  useEffect(() => {
    // Set user online status and last seen
    const userStatusRef = ref(database, `users/${user.uid}`);
    set(userStatusRef, {
      online: true,
      lastSeen: serverTimestamp(),
      displayName: user.displayName,
      photoURL: user.photoURL,
      description: users[user.uid]?.description || ''
    });

    // Update last seen on disconnect
    const userOfflineRef = ref(database, `users/${user.uid}/lastSeen`);
    set(userOfflineRef, serverTimestamp());

    // Listen to all users
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        setUsers(snapshot.val());
        // Update description state when users data changes
        if (snapshot.val()[user.uid]?.description) {
          setNewDescription(snapshot.val()[user.uid].description);
        }
      }
    });

    // Cleanup
    return () => {
      set(userStatusRef, {
        online: false,
        lastSeen: serverTimestamp(),
        displayName: user.displayName,
        photoURL: user.photoURL
      });
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [user]);

  // Listen to private messages when a user is selected
  useEffect(() => {
    if (!selectedUser) return;

    const chatId = [user.uid, selectedUser].sort().join('_');
    const messagesRef = ref(database, `private_messages/${chatId}`);
    
    onValue(messagesRef, (snapshot) => {
      if (snapshot.exists()) {
        const messagesArray = Object.entries(snapshot.val()).map(([key, value]) => ({
          id: key,
          ...value
        }));
        setMessages(messagesArray.sort((a, b) => a.timestamp - b.timestamp));
      } else {
        setMessages([]);
      }
    });
  }, [selectedUser, user.uid]);

  const sendMessage = async (fileUrl = null, fileType = null) => {
    if ((newMessage.trim() || fileUrl) && selectedUser) {
      const chatId = [user.uid, selectedUser].sort().join('_');
      const messagesRef = ref(database, `private_messages/${chatId}`);
      push(messagesRef, {
        text: newMessage,
        sender: user.uid,
        receiver: selectedUser,
        senderName: user.displayName,
        timestamp: Date.now(),
        read: false,
        fileUrl,
        fileType
      });
      setNewMessage('');
    }
  };

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const CLOUDINARY_CLOUD_NAME = 'dh77mjbpt';
    const UPLOAD_PRESET = 'ml_default';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Upload failed');
      }

      const data = await response.json();
      const fileType = file.type.split('/')[0];
      await sendMessage(data.secure_url, fileType);

    } catch (error) {
      console.error('File upload failed:', error);
      toast({
        title: 'Error uploading file',
        description: 'Please make sure you have proper upload permissions. Try again later.',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Never';
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  useEffect(() => {
    // Listen for incoming calls
    const callsRef = ref(database, `calls/${user.uid}`);
    const unsubscribe = onValue(callsRef, async (snapshot) => {
      if (snapshot.exists() && !calling && !receiving) {
        const callData = snapshot.val();
        if (!callData || !callData.signal || !callData.from) {
          console.error('Invalid call data received');
          return;
        }

        // Show call notification toast
        const callerName = users[callData.from]?.displayName || 'Someone';
        const callToast = toast({
          title: 'Incoming Call',
          description: `${callerName} is calling you`,
          status: 'info',
          duration: null,
          isClosable: false,
          position: 'top',
          render: ({ onClose }) => (
            <Box p={4} bg="white" borderRadius="md" boxShadow="lg">
              <VStack spacing={3}>
                <Text fontWeight="bold">Incoming Call from {callerName}</Text>
                <HStack spacing={3}>
                  <Button
                    colorScheme="green"
                    onClick={async () => {
                      onClose();
                      setReceiving(true);
                      setSelectedUser(callData.from);
                      try {
                        const stream = await navigator.mediaDevices.getUserMedia({
                          video: {
                            width: { ideal: 640 },
                            height: { ideal: 480 },
                            frameRate: { max: 30 }
                          },
                          audio: {
                            echoCancellation: true,
                            noiseSuppression: true
                          }
                        });
                        setStream(stream);
                        if (localVideoRef.current) {
                          localVideoRef.current.srcObject = stream;
                        }

                        const peer = new Peer({
                          initiator: false,
                          trickle: true,
                          stream,
                          config: {
                            iceServers: [
                              { urls: 'stun:stun.l.google.com:19302' },
                              { urls: 'stun:global.stun.twilio.com:3478' },
                              { urls: 'stun:stun1.l.google.com:19302' },
                              { urls: 'stun:stun2.l.google.com:19302' },
                              { urls: 'stun:stun3.l.google.com:19302' },
                              { urls: 'stun:stun4.l.google.com:19302' }
                            ],
                            iceCandidatePoolSize: 10
                          }
                        });

                        peer.on('connect', () => {
                          console.log('Peer connection established for receiver');
                          toast({
                            title: 'Connected',
                            description: 'Call connection established successfully',
                            status: 'success',
                            duration: 3000,
                            isClosable: true
                          });
                        });

                        peer.on('signal', data => {
                          const answerRef = ref(database, `calls/${callData.from}`);
                          set(answerRef, {
                            signal: data,
                            from: user.uid,
                            type: 'answer'
                          });
                        });

                        peer.on('stream', remoteStream => {
                          if (remoteVideoRef.current) {
                            remoteVideoRef.current.srcObject = remoteStream;
                          }
                        });

                        peer.on('error', err => {
                          console.error('Peer connection error:', err);
                          endCall();
                        });

                        peer.signal(callData.signal);
                        peerRef.current = peer;
                      } catch (error) {
                        console.error('Error accessing media devices:', error);
                        setReceiving(false);
                        toast({
                          title: 'Error',
                          description: 'Could not access camera or microphone',
                          status: 'error',
                          duration: 5000,
                          isClosable: true
                        });
                      }
                    }}
                  >
                    Accept
                  </Button>
                  <Button
                    colorScheme="red"
                    onClick={() => {
                      onClose();
                      // Notify caller that call was declined
                      const declineRef = ref(database, `calls/${callData.from}`);
                      set(declineRef, {
                        from: user.uid,
                        type: 'decline'
                      });
                    }}
                  >
                    Decline
                  </Button>
                </HStack>
              </VStack>
            </Box>
          )
        });
      }
    });

    return () => {
      unsubscribe();
      endCall(); // Clean up any ongoing call when component unmounts
    };
  }, [user.uid, calling, receiving, users, toast]);

  const startCall = async (recipientId) => {
    if (calling || receiving) {
      toast({
        title: "Call in Progress",
        description: "Please end the current call before starting a new one",
        status: "warning",
        duration: 3000,
        isClosable: true
      });
      return;
    }

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { max: 30 }
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true
        }
      });

      setStream(mediaStream);
      setCalling(true);

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
      }

      const peer = new Peer({
        initiator: true,
        trickle: true,
        stream: mediaStream,
        config: {
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:stun3.l.google.com:19302' },
            { urls: 'stun:stun4.l.google.com:19302' }
          ],
          iceCandidatePoolSize: 10
        }
      });

      peer.on('signal', async data => {
        try {
          const callRef = ref(database, `calls/${recipientId}`);
          await set(callRef, {
            signal: data,
            from: user.uid,
            type: 'offer',
            timestamp: Date.now()
          });
        } catch (error) {
          console.error('Error sending call signal:', error);
          endCall();
        }
      });

      peer.on('connect', () => {
        console.log('Peer connection established');
        toast({
          title: 'Connected',
          description: 'Call connection established successfully',
          status: 'success',
          duration: 3000,
          isClosable: true
        });
      });

      peer.on('stream', remoteStream => {
        if (remoteVideoRef.current) {
          remoteVideoRef.current.srcObject = remoteStream;
        }
      });

      peer.on('error', err => {
        console.error('Peer connection error:', err);
        toast({
          title: 'Connection Error',
          description: 'Failed to establish call connection. Please try again.',
          status: 'error',
          duration: 5000,
          isClosable: true
        });
        endCall();
      });

      peer.on('close', () => {
        console.log('Peer connection closed');
        endCall();
      });

      peerRef.current = peer;

      // Listen for answer
      const callRef = ref(database, `calls/${user.uid}`);
      const unsubscribe = onValue(callRef, snapshot => {
        const data = snapshot.val();
        if (!data) return;

        if (data.type === 'answer' && peer && !peer.destroyed) {
          peer.signal(data.signal);
        } else if (data.type === 'decline') {
          toast({
            title: 'Call Declined',
            description: 'The recipient declined your call',
            status: 'info',
            duration: 5000,
            isClosable: true
          });
          endCall();
        }
      });

      // Set a timeout for the call offer
      const timeout = setTimeout(() => {
        if (calling && (!peer.connected || peer.destroyed)) {
          toast({
            title: 'Call Failed',
            description: 'No answer received. The call has timed out.',
            status: 'warning',
            duration: 5000,
            isClosable: true
          });
          endCall();
        }
      }, 30000);

      // Cleanup function
      const cleanup = () => {
        clearTimeout(timeout);
        unsubscribe();
        if (callRef) {
          set(callRef, null);
        }
      };

      // Add cleanup to peer's close event
      peer.on('close', cleanup);

    } catch (error) {
      console.error('Failed to start call:', error);
      toast({
        title: 'Error',
        description: error.message || 'Could not start the call',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
      setCalling(false);
    }
  };

  const toggleAudio = () => {
    if (stream) {
      stream.getAudioTracks()[0].enabled = !audioEnabled;
      setAudioEnabled(!audioEnabled);
    }
  };

  const toggleVideo = () => {
    if (stream) {
      stream.getVideoTracks()[0].enabled = !videoEnabled;
      setVideoEnabled(!videoEnabled);
    }
  };

  const handlePhotoChange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const CLOUDINARY_CLOUD_NAME = 'dh77mjbpt';
    const UPLOAD_PRESET = 'ml_default';
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', UPLOAD_PRESET);

    try {
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/auto/upload`,
        {
          method: 'POST',
          body: formData
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Upload failed');
      }

      const data = await response.json();
      await updateProfile(auth.currentUser, {
        photoURL: data.secure_url
      });

      toast({
        title: 'Success',
        description: 'Profile photo updated successfully',
        status: 'success',
        duration: 3000,
        isClosable: true
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update profile photo',
        status: 'error',
        duration: 5000,
        isClosable: true
      });
    }
  };

  const updateDisplayName = async () => {
    try {
      await updateProfile(auth.currentUser, {
        displayName: newDisplayName
      });

      // Update description in Firebase
      const userRef = ref(database, `users/${user.uid}`);
      await set(userRef, {
        ...users[user.uid],
        displayName: newDisplayName,
        description: newDescription
      });

      toast({
        title: 'Success',
        description: 'Profile updated successfully',
        status: 'success',
        duration: 3000,
        isClosable: true
      });
      onClose();
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        status: 'error',
        duration: 3000,
        isClosable: true
      });
    }
  };

  const endCall = () => {
    if (peerRef.current) {
      peerRef.current.destroy();
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    setStream(null);
    setCalling(false);
    setReceiving(false);
    setVideoEnabled(true);
    setAudioEnabled(true);
  };

  return (
    <Box h="100vh" bg="gray.50">
      <HStack h="full" spacing={0}>
        {/* User List */}
        <Box w="300px" h="full" bg="white" borderRight="1px" borderColor="gray.200" overflowY="auto">
          <VStack p={4} spacing={4} align="stretch">
            <HStack justify="space-between">
              <HStack spacing={2}>
                <Avatar
                  size="sm"
                  src={user.photoURL}
                  name={user.displayName}
                  cursor="pointer"
                  onClick={() => handleProfileClick(user.uid)}
                />
                <Text fontWeight="bold">{user.displayName}</Text>
              </HStack>
              <IconButton
                icon={<FaCog />}
                variant="ghost"
                onClick={onOpen}
                aria-label="Settings"
              />
            </HStack>
            <List spacing={2}>
              {Object.entries(users)
                .filter(([id]) => id !== user.uid)
                .map(([id, userData]) => (
                  <ListItem
                    key={id}
                    onClick={() => handleUserClick(id)}
                    bg={selectedUser === id ? 'gray.100' : 'transparent'}
                    p={2}
                    borderRadius="md"
                    cursor="pointer"
                    _hover={{ bg: 'gray.100' }}
                  >
                    <HStack spacing={3} position="relative">
                      <Avatar
                        size="sm"
                        src={userData.photoURL}
                        name={userData.displayName}
                      />
                      <VStack align="start" spacing={0}>
                        <Text fontWeight="medium">{userData.displayName}</Text>
                        <Text fontSize="sm" color="gray.500">
                          {userData.online ? 'Online' : `Last seen: ${formatLastSeen(userData.lastSeen)}`}
                        </Text>
                      </VStack>
                      {unreadMessages[id] > 0 && (
                        <Box
                          position="absolute"
                          right={2}
                          bg="blue.500"
                          color="white"
                          borderRadius="full"
                          px={2}
                          py={1}
                          fontSize="xs"
                        >
                          {unreadMessages[id]}
                        </Box>
                      )}
                    </HStack>
                  </ListItem>
                ))}
            </List>
          </VStack>
        </Box>

        {/* Chat Area */}
        <VStack flex={1} h="full" spacing={0}>
          {selectedUser ? (
            <>
              {/* Chat Header */}
              <HStack
                w="full"
                p={4}
                bg="white"
                borderBottom="1px"
                borderColor="gray.200"
                spacing={4}
              >
                <Avatar
                  size="sm"
                  src={users[selectedUser]?.photoURL}
                  name={users[selectedUser]?.displayName}
                  cursor="pointer"
                  onClick={() => handleProfileClick(selectedUser)}
                />
                <VStack align="start" spacing={0} flex={1}>
                  <Text fontWeight="bold">{users[selectedUser]?.displayName}</Text>
                  <Text fontSize="sm" color="gray.500">
                    {users[selectedUser]?.online ? 'Online' : `Last seen: ${formatLastSeen(users[selectedUser]?.lastSeen)}`}
                  </Text>
                </VStack>
                <HStack spacing={2}>
                  <IconButton
                    icon={<FaPhone />}
                    variant="ghost"
                    onClick={() => startCall(selectedUser)}
                    aria-label="Voice call"
                  />
                  <IconButton
                    icon={<FaVideo />}
                    variant="ghost"
                    onClick={() => startCall(selectedUser)}
                    aria-label="Video call"
                  />
                </HStack>
              </HStack>

              {/* Messages Area */}
              <Box flex={1} w="full" overflowY="auto" p={4} bg="gray.50">
                <VStack spacing={4} align="stretch">
                  {messages.map((message) => {
                    const isOwnMessage = message.sender === user.uid;
                    return (
                      <HStack
                        key={message.id}
                        justify={isOwnMessage ? 'flex-end' : 'flex-start'}
                        align="flex-start"
                        spacing={2}
                      >
                        {!isOwnMessage && (
                          <Avatar
                            size="sm"
                            src={users[message.sender]?.photoURL}
                            name={users[message.sender]?.displayName}
                          />
                        )}
                        <VStack
                          maxW="70%"
                          align={isOwnMessage ? 'end' : 'start'}
                          spacing={1}
                        >
                          <Box
                            bg={isOwnMessage ? 'blue.500' : 'white'}
                            color={isOwnMessage ? 'white' : 'black'}
                            px={4}
                            py={2}
                            borderRadius="2xl"
                            boxShadow="sm"
                          >
                            {message.fileUrl ? (
                              message.fileType === 'image' ? (
                                <Image
                                  src={message.fileUrl}
                                  maxH="200px"
                                  borderRadius="md"
                                  alt="Shared image"
                                />
                              ) : (
                                <Link href={message.fileUrl} isExternal color={isOwnMessage ? 'white' : 'blue.500'}>
                                  📎 Attachment
                                </Link>
                              )
                            ) : (
                              <Text>{message.text}</Text>
                            )}
                          </Box>
                          <Text fontSize="xs" color="gray.500">
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </Text>
                        </VStack>
                        {isOwnMessage && (
                          <Avatar
                            size="sm"
                            src={user.photoURL}
                            name={user.displayName}
                          />
                        )}
                      </HStack>
                    );
                  })}
                </VStack>
              </Box>

              {/* Input Area */}
              <HStack
                w="full"
                p={4}
                bg="white"
                borderTop="1px"
                borderColor="gray.200"
                spacing={4}
              >
                <IconButton
                  icon={<FaPaperclip />}
                  variant="ghost"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="Attach file"
                />
                <Input
                  flex={1}
                  placeholder="Type a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  bg="gray.50"
                  borderRadius="full"
                />
                <Button
                  colorScheme="blue"
                  onClick={() => sendMessage()}
                  isDisabled={!newMessage.trim()}
                  borderRadius="full"
                >
                  Send
                </Button>
              </HStack>
            </>
          ) : (
            <Center flex={1}>
              <Text color="gray.500">Select a user to start chatting</Text>
            </Center>
          )}
        </VStack>

        {/* Video Call Area */}
        {(calling || receiving) && (
          <Box
            position="fixed"
            top={0}
            left={0}
            right={0}
            bottom={0}
            bg="rgba(0, 0, 0, 0.8)"
            zIndex={1000}
            p={4}
          >
            <VStack h="full" justify="center" spacing={4}>
              <HStack spacing={4} justify="center">
                <Box w="320px" h="240px" bg="black" borderRadius="md" overflow="hidden">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    playsInline
                    muted
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
                <Box w="320px" h="240px" bg="black" borderRadius="md" overflow="hidden">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    playsInline
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                </Box>
              </HStack>
              <HStack spacing={4}>
                <IconButton
                  icon={audioEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
                  onClick={() => {
                    if (stream) {
                      const audioTrack = stream.getAudioTracks()[0];
                      if (audioTrack) {
                        audioTrack.enabled = !audioEnabled;
                        setAudioEnabled(!audioEnabled);
                      }
                    }
                  }}
                  colorScheme={audioEnabled ? 'blue' : 'red'}
                  rounded="full"
                  aria-label="Toggle audio"
                />
                <IconButton
                  icon={videoEnabled ? <FaVideo /> : <FaVideoSlash />}
                  onClick={() => {
                    if (stream) {
                      const videoTrack = stream.getVideoTracks()[0];
                      if (videoTrack) {
                        videoTrack.enabled = !videoEnabled;
                        setVideoEnabled(!videoEnabled);
                      }
                    }
                  }}
                  colorScheme={videoEnabled ? 'blue' : 'red'}
                  rounded="full"
                  aria-label="Toggle video"
                />
                <IconButton
                  icon={<FaPhone />}
                  onClick={endCall}
                  colorScheme="red"
                  rounded="full"
                  transform="rotate(135deg)"
                  aria-label="End call"
                />
              </HStack>
            </VStack>
          </Box>
        )}
      </HStack>

      {/* Settings Modal */}
      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Profile Settings</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <Box position="relative">
                <Avatar
                  size="2xl"
                  src={user.photoURL}
                  name={user.displayName}
                />
                <IconButton
                  aria-label="Change profile picture"
                  icon={<FaPlus />}
                  size="sm"
                  colorScheme="blue"
                  position="absolute"
                  bottom="0"
                  right="0"
                  rounded="full"
                  onClick={() => photoInputRef.current?.click()}
                />
                <Input
                  type="file"
                  accept="image/*"
                  hidden
                  ref={photoInputRef}
                  onChange={handleProfilePictureChange}
                />
              </Box>
              <Input
                placeholder="Display Name"
                value={newDisplayName}
                onChange={(e) => setNewDisplayName(e.target.value)}
              />
              <Input
                placeholder="Description"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
              />
            </VStack>
          </ModalBody>
          <ModalFooter>
            <VStack spacing={4} width="100%">
              <Button colorScheme="blue" onClick={handleSaveProfile} width="100%">
                Save Changes
              </Button>
              <Button colorScheme="gray" onClick={handleSignOut} width="100%">
                Sign Out
              </Button>
              <Button colorScheme="red" onClick={handleDeleteAccount} width="100%">
                Delete Account
              </Button>
            </VStack>
          </ModalFooter>
        </ModalContent>
      </Modal>

      {/* View User Profile Modal */}
      <ViewUserProfileModal
        isOpen={isUserProfileOpen}
        onClose={onUserProfileClose}
        user={viewingUser}
      />

      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileUpload}
      />
    </Box>
  );
};

export default Chat;