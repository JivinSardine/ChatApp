import { useEffect, useState, useRef } from 'react';
import { Box, VStack, HStack, Input, Button, Text, Avatar, IconButton, useToast, List, ListItem, Center, Modal, ModalOverlay, ModalContent, ModalHeader, ModalFooter, ModalBody, ModalCloseButton, useDisclosure } from '@chakra-ui/react';
import CryptoJS from 'crypto-js';
import { ref, onValue, push, set, serverTimestamp, query, orderByChild, equalTo } from 'firebase/database';
import { FaVideo, FaPhone, FaMicrophone, FaMicrophoneSlash, FaVideoSlash, FaPaperclip, FaPlus, FaCog } from 'react-icons/fa';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile } from 'firebase/auth';
import Peer from 'simple-peer';
import { database, auth } from '../App';

const Chat = ({ user }) => {
  const { isOpen, onOpen, onClose } = useDisclosure();
  const [newDisplayName, setNewDisplayName] = useState(user.displayName);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [users, setUsers] = useState({});
  const [selectedUser, setSelectedUser] = useState(null);
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
  const toast = useToast();

  useEffect(() => {
    // Set user online status and last seen
    const userStatusRef = ref(database, `users/${user.uid}`);
    set(userStatusRef, {
      online: true,
      lastSeen: serverTimestamp(),
      displayName: user.displayName,
      photoURL: user.photoURL
    });

    // Update last seen on disconnect
    const userOfflineRef = ref(database, `users/${user.uid}/lastSeen`);
    set(userOfflineRef, serverTimestamp());

    // Listen to all users
    const usersRef = ref(database, 'users');
    onValue(usersRef, (snapshot) => {
      if (snapshot.exists()) {
        setUsers(snapshot.val());
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
    <Box>
      <Box h="100vh" bg="gray.50">
        <HStack spacing={0} h="full">
          {/* Users List */}
          <Box w="300px" h="full" bg="white" borderRightWidth={1} borderColor="gray.200">
            {!selectedUser && (
              <Box
                position="absolute"
                right="0"
                top="0"
                w="calc(100vw - 300px)"
                h="100vh"
                bgImage="/ChatApp/Home.png"
                bgSize="cover"
                bgPosition="center"
                zIndex="1"
              />
            )}
            <VStack h="full" spacing={0}>
              <HStack w="full" p={4} borderBottomWidth={1} borderColor="gray.200" justify="space-between">
                <HStack>
                  <Avatar size="sm" src={user.photoURL} name={user.displayName} />
                  <Text fontWeight="bold">{user.displayName}</Text>
                </HStack>
                <IconButton
                  icon={<FaCog />}
                  variant="ghost"
                  onClick={onOpen}
                  aria-label="Settings"
                />
              </HStack>
              <Box w="full" p={4} borderBottomWidth={1} borderColor="gray.200" position="relative">
                <HStack justify="space-between" align="center">
                  <Text fontSize="2xl" fontWeight="bold">Chats</Text>
                  <IconButton
                    icon={<FaPlus />}
                    colorScheme="blue"
                    variant="solid"
                    size="sm"
                    borderRadius="full"
                    aria-label="New message"
                    onClick={() => {
                      const availableUsers = Object.entries(users)
                        .filter(([id]) => id !== user.uid && !messages.some(msg => msg.sender === id || msg.receiver === id))
                        .map(([id, userData]) => ({
                          id,
                          ...userData
                        }));

                      if (availableUsers.length > 0) {
                        setSelectedUser(availableUsers[0].id);
                        toast({
                          title: 'New Chat',
                          description: `Start chatting with ${availableUsers[0].displayName}`,
                          status: 'info',
                          duration: 3000,
                          isClosable: true
                        });
                      } else {
                        toast({
                          title: 'No New Users',
                          description: 'You are already connected with all available users',
                          status: 'info',
                          duration: 3000,
                          isClosable: true
                        });
                      }
                    }}
                  />
                </HStack>
              </Box>
              <List spacing={0} w="full" overflowY="auto" flex={1}>
                {Object.entries(users)
                  .filter(([id]) => id !== user.uid)
                  .map(([id, userData]) => (
                    <ListItem
                      key={id}
                      onClick={() => setSelectedUser(id)}
                      cursor="pointer"
                      p={4}
                      bg={selectedUser === id ? 'blue.50' : unreadMessages[id] ? 'green.50' : 'white'}
                      borderBottomWidth={1}
                      borderColor="gray.100"
                      _hover={{ bg: 'gray.50' }}
                    >
                      <HStack spacing={3}>
                        <Box position="relative">
                          <Avatar size="md" name={userData.displayName} src={userData.photoURL} />
                          {userData.online && (
                            <Box
                              position="absolute"
                              bottom={0}
                              right={0}
                              w={3}
                              h={3}
                              bg="green.400"
                              borderRadius="full"
                              borderWidth={2}
                              borderColor="white"
                            />
                          )}
                        </Box>
                        <VStack align="start" spacing={1} flex={1}>
                          <Text fontWeight="semibold">{userData.displayName}</Text>
                          <Text fontSize="sm" color="gray.500">
                            {userData.online ? 'Active now' : `Last seen: ${formatLastSeen(userData.lastSeen)}`}
                          </Text>
                        </VStack>
                      </HStack>
                    </ListItem>
                  ))}
              </List>
            </VStack>
          </Box>

          {/* Chat Area */}
          <VStack flex={1} h="full" bg="white" spacing={0}>
            {selectedUser ? (
              <>
                <Box w="full" p={4} bg="white" borderBottomWidth={1} borderColor="gray.200">
                  <HStack justify="space-between" align="center">
                    <HStack spacing={3}>
                      <Avatar size="sm" name={users[selectedUser]?.displayName} src={users[selectedUser]?.photoURL} />
                      <VStack align="start" spacing={0}>
                        <Text fontWeight="semibold">{users[selectedUser]?.displayName}</Text>
                        <Text fontSize="sm" color="gray.500">
                          {users[selectedUser]?.online ? 'Active now' : `Last seen: ${formatLastSeen(users[selectedUser]?.lastSeen)}`}
                        </Text>
                      </VStack>
                    </HStack>
                    <HStack spacing={2}>
                      <IconButton
                        icon={<FaVideo />}
                        onClick={() => startCall(selectedUser)}
                        aria-label="Start video call"
                        variant="ghost"
                        colorScheme="blue"
                        size="lg"
                      />
                    </HStack>
                  </HStack>
                </Box>
                <VStack flex={1} w="full" spacing={4} p={4} overflowY="auto">
                  {messages.map((message) => (
                    <Box
                      key={message.id}
                      alignSelf={message.sender === user.uid ? 'flex-end' : 'flex-start'}
                      maxW="70%"
                    >
                      <Box
                        bg={message.sender === user.uid ? 'blue.500' : 'gray.100'}
                        color={message.sender === user.uid ? 'white' : 'black'}
                        px={4}
                        py={2}
                        borderRadius="lg"
                      >
                        {message.fileUrl ? (
                          message.fileType === 'image' ? (
                            <img src={message.fileUrl} alt="Shared" style={{ maxWidth: '100%', borderRadius: '8px' }} />
                          ) : (
                            <a href={message.fileUrl} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                              View Attachment
                            </a>
                          )
                        ) : (
                          <Text>{message.text}</Text>
                        )}
                      </Box>
                      <Text fontSize="xs" color="gray.500" mt={1}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </Text>
                    </Box>
                  ))}
                </VStack>
                <HStack w="full" p={4} borderTopWidth={1} borderColor="gray.200">
                  <Input
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Type a message..."
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                  />
                  <IconButton
                    icon={<FaPaperclip />}
                    onClick={() => fileInputRef.current?.click()}
                    aria-label="Attach file"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleFileUpload}
                  />
                  <Button colorScheme="blue" onClick={() => sendMessage()}>
                    Send
                  </Button>
                </HStack>
              </>
            ) : (
              <Center flex={1}>
                <Box maxW="600px" w="full">
                  <img src="/ChatApp/Home.png" alt="Welcome" style={{ width: '100%', height: 'auto' }} />
                </Box>
              </Center>
            )}
          </VStack>

          {/* Video Call Area */}
          {(calling || receiving) && (
            <Box w="300px" h="full" bg="white" borderLeftWidth={1} borderColor="gray.200">
              <VStack h="full" spacing={4} p={4}>
                <Text fontSize="lg" fontWeight="semibold">Video Call</Text>
                <Box w="full" position="relative" bg="gray.900" borderRadius="lg" overflow="hidden">
                  <video
                    ref={localVideoRef}
                    autoPlay
                    muted
                    style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }}
                  />
                </Box>
                <Box w="full" position="relative" bg="gray.900" borderRadius="lg" overflow="hidden">
                  <video
                    ref={remoteVideoRef}
                    autoPlay
                    style={{ width: '100%', aspectRatio: '16/9', objectFit: 'cover' }}
                  />
                </Box>
                <HStack spacing={4} justify="center">
                  <IconButton
                    icon={audioEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
                    onClick={toggleAudio}
                    aria-label="Toggle audio"
                    colorScheme={audioEnabled ? 'blue' : 'red'}
                    variant="solid"
                    size="lg"
                    isRound
                  />
                  <IconButton
                    icon={videoEnabled ? <FaVideo /> : <FaVideoSlash />}
                    onClick={toggleVideo}
                    aria-label="Toggle video"
                    colorScheme={videoEnabled ? 'blue' : 'red'}
                    variant="solid"
                    size="lg"
                    isRound
                  />
                  <IconButton
                    colorScheme="red"
                    onClick={endCall}
                    aria-label="End call"
                    icon={<FaPhone style={{ transform: 'rotate(135deg)' }} />}
                    variant="solid"
                    size="lg"
                    isRound
                  />
                </HStack>
              </VStack>
            </Box>
          )}
        </HStack>
      </Box>

      <Modal isOpen={isOpen} onClose={onClose}>
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>Settings</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <VStack spacing={4}>
              <HStack w="full">
                <Avatar size="xl" src={user.photoURL} name={user.displayName} />
                <VStack align="start" spacing={1}>
                  <Text fontSize="sm" color="gray.500">Profile Picture</Text>
                  <Button
                    leftIcon={<FaPlus />}
                    colorScheme="blue"
                    onClick={() => photoInputRef.current.click()}
                  >
                    Change Photo
                  </Button>
                </VStack>
              </HStack>
              <VStack w="full" align="start" spacing={1}>
                <Text fontSize="sm" color="gray.500">Display Name</Text>
                <Input
                  value={newDisplayName}
                  onChange={(e) => setNewDisplayName(e.target.value)}
                  placeholder="Enter new display name"
                />
              </VStack>
            </VStack>
          </ModalBody>
          <ModalFooter>
            <input
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              ref={photoInputRef}
              style={{ display: 'none' }}
            />
            <Button variant="ghost" mr={3} onClick={onClose}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={updateDisplayName}
              isLoading={false}
            >
              Save Changes
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </Box>
  );
};

export default Chat;