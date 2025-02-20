import { Box, Button, Center, VStack, Text, useToast, Input, PinInput, PinInputField, HStack } from '@chakra-ui/react';
import { signInWithPopup, GoogleAuthProvider, RecaptchaVerifier, signInWithPhoneNumber } from 'firebase/auth';
import { FaGoogle, FaPhone } from 'react-icons/fa';
import { auth } from '../App';
import { useState, useEffect } from 'react';

const Login = () => {
  const toast = useToast();
  const googleProvider = new GoogleAuthProvider();
  googleProvider.setCustomParameters({
    prompt: 'select_account'
  });

  const [phoneNumber, setPhoneNumber] = useState('');
  const [verificationId, setVerificationId] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [showVerification, setShowVerification] = useState(false);

  useEffect(() => {
    if (!window.recaptchaVerifier) {
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'invisible',
        'callback': () => {
          // reCAPTCHA solved, allow signInWithPhoneNumber.
        },
        'expired-callback': () => {
          toast({
            title: 'reCAPTCHA Expired',
            description: 'Please try again',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      });
    }
  }, [toast]);

  const handlePhoneLogin = async () => {
    try {
      const formattedPhoneNumber = phoneNumber.startsWith('+') ? phoneNumber : `+${phoneNumber}`;
      const confirmationResult = await signInWithPhoneNumber(auth, formattedPhoneNumber, window.recaptchaVerifier);
      window.confirmationResult = confirmationResult;
      setVerificationId(confirmationResult.verificationId);
      setShowVerification(true);
      toast({
        title: 'Verification code sent',
        description: 'Please enter the code sent to your phone',
        status: 'success',
        duration: 5000,
        isClosable: true,
      });
    } catch (error) {
      console.error('Phone auth error:', error);
      toast({
        title: 'Error',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      // Reset reCAPTCHA on error
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    }
  };

  const verifyCode = async () => {
    try {
      if (!window.confirmationResult) {
        throw new Error('No verification code was sent');
      }
      await window.confirmationResult.confirm(verificationCode);
    } catch (error) {
      console.error('Verification error:', error);
      toast({
        title: 'Error',
        description: error.message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error('Google auth error:', error);
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
            mb={2}
          >
            Sign in with Google
          </Button>
          
          {!showVerification ? (
            <>
              <Input
                placeholder="Enter phone number (with country code)"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                size="lg"
              />
              <Button
                leftIcon={<FaPhone />}
                colorScheme="blue"
                variant="solid"
                onClick={handlePhoneLogin}
                size="lg"
                isDisabled={!phoneNumber}
              >
                Sign in with Phone
              </Button>
            </>
          ) : (
            <>
              <HStack spacing={4} justify="center">
                <PinInput value={verificationCode} onChange={setVerificationCode}>
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                  <PinInputField />
                </PinInput>
              </HStack>
              <Button
                colorScheme="green"
                onClick={verifyCode}
                size="lg"
                isDisabled={verificationCode.length !== 6}
              >
                Verify Code
              </Button>
            </>
          )}
          <div id="recaptcha-container"></div>
        </VStack>
      </Box>
    </Center>
  );
};

export default Login;