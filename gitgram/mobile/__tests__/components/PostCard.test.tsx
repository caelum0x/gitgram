import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import PostCard from '../../components/Post/PostCard';

const mockPost = {
  id: '1',
  userId: 'user1',
  content: 'Test post content',
  mediaType: 'text',
  user: {
    id: 'user1',
    username: 'testuser',
    avatar: 'https://example.com/avatar.jpg',
  },
  likesCount: 10,
  commentsCount: 5,
  isLiked: false,
  createdAt: new Date().toISOString(),
};

describe('PostCard', () => {
  it('renders post content correctly', () => {
    const { getAllByText, getByText } = render(<PostCard post={mockPost} />);
    expect(getByText('Test post content')).toBeTruthy();
    expect(getAllByText('testuser').length).toBeGreaterThan(0);
  });

  it('displays like count', () => {
    const { getByText } = render(<PostCard post={mockPost} />);
    expect(getByText(/10/)).toBeTruthy();
  });

  it('displays comment count', () => {
    const { getByText } = render(<PostCard post={mockPost} />);
    expect(getByText(/5/)).toBeTruthy();
  });
});
