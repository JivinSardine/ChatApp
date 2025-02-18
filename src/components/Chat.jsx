import { useEffect, useState, useRef } from 'react';
import { Box, VStack, HStack, Input, Button, Text, Avatar, IconButton, useToast, List, ListItem } from '@chakra-ui/react';
import CryptoJS from 'crypto-js';
import { ref, onValue, push, set, serverTimestamp, query, orderByChild, equalTo } from 'firebase/database';
import { FaVideo, FaPhone, FaMicrophone, FaMicrophoneSlash, FaVideoSlash, FaPaperclip } from 'react-icons/fa';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import Peer from 'simple-peer';
import { database } from '../App';

const Chat = ({ user }) => {
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
    <Box h="100vh" p={4}>
      <HStack spacing={4} h="full">
        {/* Users List */}
        <VStack w="250px" h="full" p={4} borderWidth={1} borderRadius="lg" spacing={4}>
          <Text fontSize="xl" fontWeight="bold">Users</Text>
          <List spacing={3} w="full">
            {Object.entries(users)
              .filter(([id]) => id !== user.uid)
              .map(([id, userData]) => (
                <ListItem
                  key={id}
                  onClick={() => setSelectedUser(id)}
                  cursor="pointer"
                  p={2}
                  bg={selectedUser === id ? 'blue.100' : unreadMessages[id] ? 'green.100' : 'transparent'}
                  borderRadius="md"
                  _hover={{ bg: 'gray.100' }}
                >
                  <HStack>
                    <Avatar size="sm" name={userData.displayName} src={userData.photoURL} />
                    <VStack align="start" spacing={0}>
                      <Text fontWeight="bold">{userData.displayName}</Text>
                      <Text fontSize="xs">
                        {userData.online ? 'Online' : `Last seen: ${formatLastSeen(userData.lastSeen)}`}
                      </Text>
                    </VStack>
                  </HStack>
                </ListItem>
              ))}
          </List>
          {selectedUser && users[selectedUser] && (
            <HStack w="full" justify="center">
              <IconButton
                icon={<FaVideo />}
                onClick={() => startCall(selectedUser)}
                aria-label="Start call"
              />
            </HStack>
          )}
        </VStack>

        {/* Chat Area */}
        <VStack flex={1} h="full" borderWidth={1} borderRadius="lg" p={4} spacing={4}>
          {selectedUser ? (
            <>
              <Box flex={1} w="full" overflowY="auto">
                {messages.map((message) => (
                  <HStack
                    key={message.id}
                    justify={message.sender === user.uid ? 'flex-end' : 'flex-start'}
                    mb={2}
                  >
                    {message.sender !== user.uid && (
                      <Avatar size="sm" name={message.senderName} />
                    )}
                    <Box
                      bg={message.sender === user.uid ? 'blue.500' : 'gray.100'}
                      color={message.sender === user.uid ? 'white' : 'black'}
                      px={4}
                      py={2}
                      borderRadius="lg"
                      maxW="70%"
                    >
                      {message.fileUrl && (
                        <Box mb={2}>
                          {message.fileType === 'image' && (
                            <img src={message.fileUrl} alt="Shared image" style={{ maxWidth: '100%', borderRadius: '4px' }} />
                          )}
                          {message.fileType === 'video' && (
                            <video controls style={{ maxWidth: '100%', borderRadius: '4px' }}>
                              <source src={message.fileUrl} type="video/mp4" />
                            </video>
                          )}
                          {message.fileType === 'audio' && (
                            <audio controls style={{ width: '100%' }}>
                              <source src={message.fileUrl} type="audio/mpeg" />
                            </audio>
                          )}
                          {!['image', 'video', 'audio'].includes(message.fileType) && (
                            <Button as="a" href={message.fileUrl} target="_blank" size="sm" colorScheme="blue">
                              Download File
                            </Button>
                          )}
                        </Box>
                      )}
                      {message.text && <Text>{message.text}</Text>}
                      <Text fontSize="xs" opacity={0.8}>
                        {new Date(message.timestamp).toLocaleTimeString()}
                      </Text>
                    </Box>
                  </HStack>
                ))}
              </Box>
              <HStack w="full">
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Type a message..."
                  onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                />
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  style={{ display: 'none' }}
                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                />
                <IconButton
                  icon={<FaPaperclip />}
                  onClick={() => fileInputRef.current.click()}
                  aria-label="Attach file"
                />
                <Button onClick={() => sendMessage()}>Send</Button>
              </HStack>
            </>
          ) : (
            <Text>Select a user to start chatting</Text>
          )}
        </VStack>

        {/* Video Call Area */}
        {(calling || receiving) && (
          <VStack w="300px" h="full" borderWidth={1} borderRadius="lg" p={4} spacing={4}>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              style={{ width: '100%', borderRadius: '8px' }}
            />
            <video
              ref={remoteVideoRef}
              autoPlay
              style={{ width: '100%', borderRadius: '8px' }}
            />
            <HStack spacing={4}>
              <IconButton
                icon={audioEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
                onClick={toggleAudio}
                aria-label="Toggle audio"
              />
              <IconButton
                icon={videoEnabled ? <FaVideo /> : <FaVideoSlash />}
                onClick={toggleVideo}
                aria-label="Toggle video"
              />
              <IconButton
                colorScheme="red"
                onClick={endCall}
                aria-label="End call"
                icon={<FaPhone style={{ transform: 'rotate(135deg)' }} />}
              />
            </HStack>
          </VStack>
        )}
      </HStack>
    </Box>
  );
};

export default Chat;