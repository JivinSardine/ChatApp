import { Box, Button, Center, VStack, Text, useToast } from '@chakra-ui/react';
import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { FaGoogle } from 'react-icons/fa';
import { auth } from '../App';

const Login = () => {
  const toast = useToast();
  const googleProvider = new GoogleAuthProvider();

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      toast({
        title: 'Error',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  return (
    <Center h="100vh" bg="gray.100">
      <Box p={8} maxWidth="400px" borderWidth={1} borderRadius={8} boxShadow="lg" bg="white">
        <VStack spacing={4} align="stretch">
          <Text fontSize="2xl" textAlign="center" mb={4}>
            Welcome to Chat & Call App
          </Text>
          <Button
            leftIcon={<FaGoogle />}
            colorScheme="red"
            variant="solid"
            onClick={handleGoogleLogin}
            size="lg"
          >
            Sign in with Google
          </Button>
        </VStack>
      </Box>
    </Center>
  );
};

export default Login;